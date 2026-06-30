const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../config.json');
const storage = require('./storage');
const {
  hojeKey,
  horaAtualHHMM,
  normalizarHora,
  diferencaEmHoras,
  formatarHoras,
  eDiaUtil,
} = require('./timeUtils');

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
  console.log('Escaneie este QR code com o WhatsApp (Aparelhos conectados):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Bot conectado e pronto.');
});

client.on('message', async (msg) => {
  const texto = msg.body.trim().toLowerCase();
  const partes = texto.split(/\s+/);
  const comando = partes[0];

  try {
    if (comando === 'entrada') {
      await registrarEntrada(msg, partes[1]);
    } else if (comando === 'saida' || comando === 'saída') {
      await registrarSaida(msg, partes[1]);
    } else if (comando === 'saldo') {
      await mostrarSaldo(msg);
    } else if (comando === 'ajuda' || comando === 'help') {
      await msg.reply(textoAjuda());
    }
  } catch (erro) {
    console.error('Erro ao processar mensagem:', erro);
    await msg.reply('Deu um erro aqui ao processar isso. Tenta de novo.');
  }
});

function textoAjuda() {
  return [
    'Comandos disponiveis:',
    '*entrada* ou *entrada 08:00* - registra a entrada (usa o horario informado ou o horario atual)',
    '*saida* ou *saida 17:00* - registra a saida e calcula o saldo do dia',
    '*saldo* - mostra o saldo acumulado do mes (extra ou em falta)',
    '*ajuda* - mostra esta mensagem',
  ].join('\n');
}

async function registrarEntrada(msg, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await msg.reply('Hora invalida. Use o formato HH:MM, por exemplo: entrada 08:00');
    return;
  }

  const registroExistente = storage.getRegistroDoDia(dataKey) || {};
  registroExistente.entrada = hora;
  storage.salvarRegistroDoDia(dataKey, registroExistente);

  await msg.reply(`Entrada registrada as ${hora}.`);
}

async function registrarSaida(msg, horaTexto) {
  const dataKey = hojeKey();
  const hora = horaTexto ? normalizarHora(horaTexto) : horaAtualHHMM();

  if (horaTexto && !hora) {
    await msg.reply('Hora invalida. Use o formato HH:MM, por exemplo: saida 17:00');
    return;
  }

  const registro = storage.getRegistroDoDia(dataKey);
  if (!registro || !registro.entrada) {
    await msg.reply('Nao encontrei a entrada de hoje. Manda "entrada HH:MM" primeiro.');
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

  await msg.reply(
    `Saida registrada as ${hora}.\nTrabalhado hoje: ${formatarHoras(horasTrabalhadas)}.\n${resultado}`
  );
}

async function mostrarSaldo(msg) {
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
    await msg.reply('Ainda nao ha dias fechados (com entrada e saida) registrados este mes.');
    return;
  }

  const status = saldoTotal >= 0
    ? `Saldo positivo de ${formatarHoras(saldoTotal)}.`
    : `Saldo negativo (faltando) de ${formatarHoras(Math.abs(saldoTotal))}.`;

  await msg.reply(`Saldo do mes (${diasContabilizados} dia(s) fechados):\n${status}`);
}

client.initialize();
