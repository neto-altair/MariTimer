import config from './config.js';

// Manda o registro do dia para uma planilha do Google Sheets via Apps Script.
// Se nao houver webhookUrl configurada, nao faz nada (sincronizacao desligada).
// Falha de rede aqui nunca deve quebrar o bot: os dados ja estao salvos
// localmente antes dessa funcao ser chamada.
export async function sincronizarComPlanilha(dataKey, registro) {
  const { webhookUrl, secret } = config.googleSheets || {};
  if (!webhookUrl || !secret) return;

  const batidas = registro.batidas || [];
  const horasTrabalhadas = typeof registro.horasTrabalhadas === 'number'
    ? registro.horasTrabalhadas
    : null;

  const payload = {
    secret,
    data: dataKey,
    batidas: batidas.map((b) => `${b.tipo === 'entrada' ? 'E' : 'S'} ${b.hora}`).join('  |  '),
    horasTrabalhadas: horasTrabalhadas !== null ? horasTrabalhadas.toFixed(2) : '',
    esperado: config.horasPorDia,
    diferenca: horasTrabalhadas !== null
      ? (horasTrabalhadas - config.horasPorDia).toFixed(2)
      : '',
  };

  try {
    const resposta = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const textoResposta = await resposta.text();
    if (textoResposta.trim() !== 'ok') {
      console.error('Planilha respondeu algo inesperado:', textoResposta);
    }
  } catch (erro) {
    console.error('Falha ao sincronizar com a planilha (dado ja esta salvo localmente):', erro.message);
  }
}
