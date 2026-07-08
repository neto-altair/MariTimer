import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from 'baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import fs from 'fs';
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
  parseData,
  formatarData,
} from './timeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// mesma logica de migracao do storage.js: a sessao autenticada do WhatsApp
// tambem sai da pasta do projeto, pra sobreviver a atualizacoes do bot.
const PASTA_SESSAO_ANTIGA = path.join(__dirname, '..', 'data', 'sessao');
const PASTA_SESSAO = path.join(storage.PASTA_DADOS, 'sessao');

if (!fs.existsSync(storage.PASTA_DADOS)) {
  fs.mkdirSync(storage.PASTA_DADOS, { recursive: true });
}
if (!fs.existsSync(PASTA_SESSAO) && fs.existsSync(PASTA_SESSAO_ANTIGA)) {
  fs.cpSync(PASTA_SESSAO_ANTIGA, PASTA_SESSAO, { recursive: true });
  console.log(`Sessao do WhatsApp migrada de ${PASTA_SESSAO_ANTIGA} para ${PASTA_SESSAO}.`);
}

// dias aguardando confirmacao de edicao: jid -> dataKey
const edicoesPendentes = new Map();

function textoAjuda() {
  return [
    'Comandos disponiveis:',
    `*entrada* ou *entrada 08:00* - registra uma entrada (usa o horario atual ou o informado)`,
    `*saida* ou *saida 12:00* - registra uma saida`,
    `A jornada tem ${config.batidasPorDia} batidas por dia. Exemplo com almoco: entrada (8h), saida (12h), entrada (13h), saida (17h).`,
    '*saldo* - mostra o saldo acumulado do mes (extra ou em falta)',
    '*exportar* - manda um arquivo CSV com todos os registros, pra abrir no PC',
    '*editar dia 08/07* - mostra o que esta registrado nesse dia (ou avisa que esta vazio) pra voce corrigir/inserir e reenviar',
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

function formatarBatidas(batidas) {
  return batidas.map((b) => `${b.tipo === 'entrada' ? 'entrada' : 'saida'} ${b.hora}`).join('\n');
}

async function registrarBatida(responder, jid, tipo, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await responder(`Hora invalida. Use o formato HH:MM, por exemplo: ${tipo} 08:00`);
    return;
  }

  const registro = storage.getRegistroDoDia(jid, dataKey) || { batidas: [] };
  if (!registro.batidas) registro.batidas = [];

  if (registro.batidas.length >= config.batidasPorDia) {
    await responder(`Voce ja completou as ${config.batidasPorDia} batidas de hoje. Se precisar corrigir algo, manda "editar dia hoje".`);
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
  storage.salvarRegistroDoDia(jid, dataKey, registro);

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

async function mostrarSaldo(responder, jid) {
  const dados = storage.getRegistrosDoUsuario(jid);
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
  const csv = gerarCsv(jid);
  // BOM no inicio ajuda o Excel a reconhecer acentuacao corretamente
  const conteudo = Buffer.from('\uFEFF' + csv, 'utf-8');
  const nomeArquivo = `ponto-${hojeKey()}.csv`;

  await sock.sendMessage(jid, {
    document: conteudo,
    fileName: nomeArquivo,
    mimetype: 'text/csv',
  });
}

async function solicitarEdicaoDia(responder, jid, textoData) {
  if (!textoData) {
    await responder('Informe o dia. Exemplo: editar dia 08/07 ou editar dia hoje.');
    return;
  }

  const dataKey = parseData(textoData);
  if (!dataKey) {
    await responder('Data invalida. Use o formato DD/MM ou DD/MM/AAAA, por exemplo: editar dia 08/07.');
    return;
  }

  const registro = storage.getRegistroDoDia(jid, dataKey);
  edicoesPendentes.set(jid, dataKey);

  if (!registro || !registro.batidas || registro.batidas.length === 0) {
    await responder(
      `Ainda nao ha nada registrado no dia ${formatarData(dataKey)}.\n\n`
      + 'Manda a lista completa das batidas desse dia (uma por linha, no formato "tipo HH:MM", comecando por entrada e alternando com saida). Exemplo:\n'
      + 'entrada 08:00\nsaida 12:00\nentrada 13:00\nsaida 17:00\n\n'
      + 'Pra cancelar, manda "cancelar".'
    );
    return;
  }

  await responder(
    `No dia ${formatarData(dataKey)} esta registrado isso:\n${formatarBatidas(registro.batidas)}\n\n`
    + 'Copie essas linhas, corrija os horarios que precisar e me manda de volta a mensagem completa (uma batida por linha, no formato "tipo HH:MM"). Pode adicionar ou remover linhas se mudar a quantidade de batidas do dia.\n'
    + 'Pra cancelar, manda "cancelar".'
  );
}

// tenta interpretar o texto como a correcao completa de um dia em edicao.
// retorna false se o texto nao parece uma lista de batidas, pra deixar o
// fluxo normal de comandos tratar a mensagem.
async function processarEdicao(responder, jid, texto) {
  const dataKey = edicoesPendentes.get(jid);
  const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean);

  const batidas = [];
  for (const linha of linhas) {
    const partesLinha = linha.split(/\s+/);
    if (partesLinha.length !== 2) return false;

    const tipoTexto = partesLinha[0].toLowerCase();
    let tipo;
    if (tipoTexto === 'entrada') tipo = 'entrada';
    else if (tipoTexto === 'saida' || tipoTexto === 'saída') tipo = 'saida';
    else return false;

    const hora = normalizarHora(partesLinha[1]);
    if (!hora) return false;

    batidas.push({ tipo, hora });
  }

  if (batidas.length === 0) return false;

  for (let i = 0; i < batidas.length; i++) {
    const esperado = i % 2 === 0 ? 'entrada' : 'saida';
    if (batidas[i].tipo !== esperado) {
      await responder('As batidas precisam alternar comecando por entrada (entrada, saida, entrada, saida...). Corrija e manda de novo, ou manda "cancelar".');
      return true;
    }
  }

  if (batidas.length > config.batidasPorDia) {
    await responder(`No maximo ${config.batidasPorDia} batidas por dia. Corrija e manda de novo, ou manda "cancelar".`);
    return true;
  }

  const registro = { batidas, horasTrabalhadas: calcularTotalTrabalhado(batidas) };
  storage.salvarRegistroDoDia(jid, dataKey, registro);
  edicoesPendentes.delete(jid);

  await responder(
    `Registros do dia ${formatarData(dataKey)} atualizados:\n${formatarBatidas(batidas)}\n`
    + `Total trabalhado: ${formatarHoras(registro.horasTrabalhadas)}.`
  );
  return true;
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

    // separa por linha antes de tudo: uma correcao de dia inteiro pode comecar
    // com "entrada", entao nao da pra confundir com o comando de uma linha so
    const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean);
    const eMultilinha = linhas.length > 1;
    const partes = (linhas[0] || '').toLowerCase().split(/\s+/);
    const comando = partes[0];
    const comandosConhecidos = new Set(['entrada', 'saida', 'saída', 'saldo', 'exportar', 'ajuda', 'help', 'cancelar']);
    const eComandoConhecido = comandosConhecidos.has(comando) || (comando === 'editar' && partes[1] === 'dia');

    try {
      if (edicoesPendentes.has(jid) && comando !== 'cancelar' && (eMultilinha || !eComandoConhecido)) {
        const tratado = await processarEdicao(responder, jid, texto);
        if (tratado) return;
      }

      if (comando === 'cancelar') {
        if (edicoesPendentes.has(jid)) {
          edicoesPendentes.delete(jid);
          await responder('Edicao cancelada.');
        } else {
          await responder('Nao ha nenhuma edicao em andamento pra cancelar.');
        }
      } else if (comando === 'entrada') {
        await registrarBatida(responder, jid, 'entrada', partes[1]);
      } else if (comando === 'saida' || comando === 'saída') {
        await registrarBatida(responder, jid, 'saida', partes[1]);
      } else if (comando === 'saldo') {
        await mostrarSaldo(responder, jid);
      } else if (comando === 'exportar') {
        await exportarCsv(sock, jid);
      } else if (comando === 'editar' && partes[1] === 'dia') {
        await solicitarEdicaoDia(responder, jid, partes.slice(2).join(' '));
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
