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
    '*entrada* ou *entrada 08:00* - registra a entrada (usa o horario informado ou o horario atual)',
    '*saida* ou *saida 17:00* - registra a saida e calcula o saldo do dia',
    '*saldo* - mostra o saldo acumulado do mes (extra ou em falta)',
    '*ajuda* - mostra esta mensagem',
  ].join('\n');
}

async function registrarEntrada(responder, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await responder('Hora invalida. Use o formato HH:MM, por exemplo: entrada 08:00');
    return;
  }

  const registroExistente = storage.getRegistroDoDia(dataKey) || {};
  registroExistente.entrada = hora;
  storage.salvarRegistroDoDia(dataKey, registroExistente);

  await responder(`Entrada registrada as ${hora}.`);
}

async function registrarSaida(responder, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await responder('Hora invalida. Use o formato HH:MM, por exemplo: saida 17:00');
    return;
  }

  const registro = storage.getRegistroDoDia(dataKey);
  if (!registro || !registro.entrada) {
    await responder('Nao encontrei a entrada de hoje. Manda "entrada HH:MM" primeiro.');
    return;
  }

  registro.saida = hora;
  const horasTrabalhadas = diferencaEmHoras(registro.entrada, hora);
  registro.horasTrabalhadas = horasTrabalhadas;
  storage.salvarRegistroDoDia(dataKey, registro);

  const horasEsperadas = config.horasPorDia;
  const diferenca = horasTrabalhadas - horasEsperadas;

  let resultado;
  if (Math.abs(diferenca) < 0.05) {
    resultado = 'Bateu exatamente a jornada do dia.';
  } else if (diferenca > 0) {
    resultado = `Hora extra: ${formatarHoras(diferenca)}.`;
  } else {
    resultado = `Faltando: ${formatarHoras(Math.abs(diferenca))}.`;
  }

  await responder(
    `Saida registrada as ${hora}.\nTrabalhado hoje: ${formatarHoras(horasTrabalhadas)}.\n${resultado}`
  );
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
    if (typeof registro.horasTrabalhadas !== 'number') continue;

    saldoTotal += registro.horasTrabalhadas - config.horasPorDia;
    diasContabilizados += 1;
  }

  if (diasContabilizados === 0) {
    await responder('Ainda nao ha dias fechados (com entrada e saida) registrados este mes.');
    return;
  }

  const status = saldoTotal >= 0
    ? `Saldo positivo de ${formatarHoras(saldoTotal)}.`
    : `Saldo negativo (faltando) de ${formatarHoras(Math.abs(saldoTotal))}.`;

  await responder(`Saldo do mes (${diasContabilizados} dia(s) fechados):\n${status}`);
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
        await registrarEntrada(responder, partes[1]);
      } else if (comando === 'saida' || comando === 'saída') {
        await registrarSaida(responder, partes[1]);
      } else if (comando === 'saldo') {
        await mostrarSaldo(responder);
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
