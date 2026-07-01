import { JWT } from 'google-auth-library';
import config from './config.js';

const NOME_ABA = 'Registros';
const CABECALHO = ['Data', 'Batidas', 'Horas trabalhadas', 'Esperado', 'Diferenca'];

let client = null;

function obterClient() {
  const { email, privateKey } = config.googleSheets;
  if (!email || !privateKey) return null;
  if (!client) {
    client = new JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  return client;
}

async function chamarApi(clienteAutenticado, metodo, caminho, corpo) {
  const { token } = await clienteAutenticado.getAccessToken();
  const resposta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Sheets API respondeu ${resposta.status}: ${texto}`);
  }

  return resposta.json();
}

// Manda o registro do dia direto para a planilha via API oficial do Google
// Sheets (sem Apps Script no meio). Se as credenciais nao estiverem
// configuradas, nao faz nada. Falha aqui nunca deve quebrar o bot: os dados
// ja estao salvos localmente antes dessa funcao ser chamada.
export async function sincronizarComPlanilha(dataKey, registro, tentativa = 1) {
  const clienteAutenticado = obterClient();
  const { sheetId } = config.googleSheets;
  if (!clienteAutenticado || !sheetId) return;

  try {
    const batidas = registro.batidas || [];
    const horasTrabalhadas = typeof registro.horasTrabalhadas === 'number'
      ? registro.horasTrabalhadas
      : null;

    const linha = [
      dataKey,
      batidas.map((b) => `${b.tipo === 'entrada' ? 'E' : 'S'} ${b.hora}`).join('  |  '),
      horasTrabalhadas !== null ? horasTrabalhadas.toFixed(2) : '',
      config.horasPorDia,
      horasTrabalhadas !== null ? (horasTrabalhadas - config.horasPorDia).toFixed(2) : '',
    ];

    const leitura = await chamarApi(
      clienteAutenticado,
      'GET',
      `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A:A`)}`
    );
    let valoresColunaA = leitura.values || [];

    if (valoresColunaA.length === 0) {
      await chamarApi(
        clienteAutenticado,
        'PUT',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A1`)}?valueInputOption=RAW`,
        { values: [CABECALHO] }
      );
      valoresColunaA = [CABECALHO];
    }

    let linhaEncontrada = -1;
    for (let i = 1; i < valoresColunaA.length; i++) {
      if (valoresColunaA[i][0] === dataKey) {
        linhaEncontrada = i + 1; // planilha comeca em 1, nao em 0
        break;
      }
    }

    if (linhaEncontrada > 0) {
      await chamarApi(
        clienteAutenticado,
        'PUT',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A${linhaEncontrada}:E${linhaEncontrada}`)}?valueInputOption=RAW`,
        { values: [linha] }
      );
    } else {
      await chamarApi(
        clienteAutenticado,
        'POST',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A:E`)}:append?valueInputOption=RAW`,
        { values: [linha] }
      );
    }
  } catch (erro) {
    // instabilidade de rede acontece, especialmente em conexao de celular.
    // tenta mais uma vez antes de desistir e so entao logar como falha.
    if (tentativa < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return sincronizarComPlanilha(dataKey, registro, tentativa + 1);
    }
    console.error('Falha ao sincronizar com a planilha (dado ja esta salvo localmente):', erro.message);
  }
}
