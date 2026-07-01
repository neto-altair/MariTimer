import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from 'baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';

import config from './config.js';
import * as storage from './storage.js';
import { gerarCsv } from './exportar.js';
import {
  hojeKey,
  horaAtualHHMM,
  normalizarHora,
  diferencaEmHoras,
  formatarHoras,
} from './timeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PASTA_SESSAO = path.join(__dirname, '..', 'data', 'sessao');

function textoAjuda() {
  return [
    'Comandos disponiveis:',
    `*entrada* ou *entrada 08:00* - registra uma entrada (usa o horario atual ou o informado)`,
    `*saida* ou *saida 12:00* - registra uma saida`,
    `A jornada tem ${config.batidasPorDia} batidas por dia. Exemplo com almoco: entrada (8h), saida (12h), entrada (13h), saida (17h).`,
    '*saldo* - mostra o saldo acumulado do mes (extra ou em falta)',
    '*exportar* - manda um arquivo CSV com todos os registros, pra abrir no PC',
    '*ajuda* - mostra esta mensagem',
  ].join('\n');
}

function calcularTotalTrabalhado(batidas) {
  let total = 0;
  for (let i = 0; i + 1 < batidas.length; i += 2) {
    total += diferencaEmHoras(batidas[i].hora, batidas[i + 1].hora);
  }
  return total;
}

async function registrarBatida(responder, tipo, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await responder(`Hora invalida. Use o formato HH:MM, por exemplo: ${tipo} 08:00`);
    return;
  }

  const registro = storage.getRegistroDoDia(dataKey) || { batidas: [] };
  if (!registro.batidas) registro.batidas = [];

  if (registro.batidas.length >= config.batidasPorDia) {
    await responder(`Voce ja completou as ${config.batidasPorDia} batidas de hoje. Se precisar corrigir algo, avise quem administra o bot.`);
    return;
  }

  const ultimaBatida = registro.batidas[registro.batidas.length - 1];

  if (tipo === 'entrada' && ultimaBatida && ultimaBatida.tipo === 'entrada') {
    await responder('Voce ja bateu entrada e ainda nao bateu saida. Manda "saida" primeiro.');
    return;
  }
  if (tipo === 'saida' && (!ultimaBatida || ultimaBatida.tipo === 'saida')) {
    await responder('Nao tem entrada em aberto. Manda "entrada" primeiro.');
    return;
  }

  registro.batidas.push({ tipo, hora });
  registro.horasTrabalhadas = calcularTotalTrabalhado(registro.batidas);
  storage.salvarRegistroDoDia(dataKey, registro);

  const numeroBatida = registro.batidas.length;
  const rotulo = tipo === 'entrada' ? 'Entrada' : 'Saida';
  let mensagem = `${rotulo} #${numeroBatida} registrada as ${hora}.`;

  const par = numeroBatida % 2 === 0;
  const diaCompleto = numeroBatida === config.batidasPorDia;

  if (par && diaCompleto) {
    const horasEsperadas = config.horasPorDia;
    const diferenca = registro.horasTrabalhadas - horasEsperadas;
    let resultado;
    if (Math.abs(diferenca) < 0.05) {
      resultado = 'Bateu exatamente a jornada do dia.';
    } else if (diferenca > 0) {
      resultado = `Hora extra: ${formatarHoras(diferenca)}.`;
    } else {
      resultado = `Faltando: ${formatarHoras(Math.abs(diferenca))}.`;
    }
    mensagem += `\nTotal trabalhado hoje: ${formatarHoras(registro.horasTrabalhadas)}.\n${resultado}`;
  } else if (par) {
    mensagem += '\nPausa registrada. Manda "entrada" quando voltar.';
  }

  await responder(mensagem);
}

async function mostrarSaldo(responder) {
  const dados = storage.carregarTudo();
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  let saldoTotal = 0;
  let diasContabilizados = 0;

  for (const [dataKey, registro] of Object.entries(dados)) {
    const [ano, mes] = dataKey.split('-').map(Number);
    if (ano !== anoAtual || mes - 1 !== mesAtual) continue;
    const batidas = registro.batidas || [];
    if (batidas.length < config.batidasPorDia) continue;
    if (typeof registro.horasTrabalhadas !== 'number') continue;

    saldoTotal += registro.horasTrabalhadas - config.horasPorDia;
    diasContabilizados += 1;
  }

  if (diasContabilizados === 0) {
    await responder('Ainda nao ha dias fechados (com todas as batidas do dia) registrados este mes.');
    return;
  }

  const status = saldoTotal >= 0
    ? `Saldo positivo de ${formatarHoras(saldoTotal)}.`
    : `Saldo negativo (faltando) de ${formatarHoras(Math.abs(saldoTotal))}.`;

  await responder(`Saldo do mes (${diasContabilizados} dia(s) fechados):\n${status}`);
}

async function exportarCsv(sock, jid) {
  const csv = gerarCsv();
  // BOM no inicio ajuda o Excel a reconhecer acentuacao corretamente
  const conteudo = Buffer.from('\uFEFF' + csv, 'utf-8');
  const nomeArquivo = `ponto-${hojeKey()}.csv`;

  await sock.sendMessage(jid, {
    document: conteudo,
    fileName: nomeArquivo,
    mimetype: 'text/csv',
  });
}

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Escaneie este QR code com o WhatsApp (Aparelhos conectados):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : null;
      const deveReconectar = codigo !== DisconnectReason.loggedOut;
      console.log(
        'Conexao fechada.',
        deveReconectar
          ? 'Tentando reconectar...'
          : 'Sessao encerrada. Apague a pasta data/sessao e rode de novo para reparear.'
      );
      if (deveReconectar) {
        iniciar();
      }
    } else if (connection === 'open') {
      console.log('Bot conectado e pronto.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const texto = (
      msg.message.conversation
      || msg.message.extendedTextMessage?.text
      || ''
    ).trim();
    if (!texto) return;

    const jid = msg.key.remoteJid;
    const responder = (resposta) => sock.sendMessage(jid, { text: resposta });

    const partes = texto.toLowerCase().split(/\s+/);
    const comando = partes[0];

    try {
      if (comando === 'entrada') {
        await registrarBatida(responder, 'entrada', partes[1]);
      } else if (comando === 'saida' || comando === 'saída') {
        await registrarBatida(responder, 'saida', partes[1]);
      } else if (comando === 'saldo') {
        await mostrarSaldo(responder);
      } else if (comando === 'exportar') {
        await exportarCsv(sock, jid);
      } else if (comando === 'ajuda' || comando === 'help') {
        await responder(textoAjuda());
      }
    } catch (erro) {
      console.error('Erro ao processar mensagem:', erro);
      await responder('Deu um erro aqui ao processar isso. Tenta de novo.');
    }
  });
}

iniciar();
