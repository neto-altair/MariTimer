import https from 'https';
import crypto from 'crypto';
import config from './config.js';

// Este modulo fala com a API do Google Sheets usando so os modulos nativos
// 'https' e 'crypto' do Node, sem usar fetch. Isso evita um bug conhecido
// de "Premature close" que acontece com fetch/undici em alguns ambientes
// (como o Termux) ao falar com os servidores do Google.

const NOME_ABA = 'Registros';
const CABECALHO = ['Data', 'Batidas', 'Horas trabalhadas', 'Esperado', 'Diferenca'];

let tokenCache = null; // { token, expiraEm }

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function criarJwtAssinado(email, privateKey) {
  const agora = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  };

  const headerCodificado = base64Url(Buffer.from(JSON.stringify(header)));
  const payloadCodificado = base64Url(Buffer.from(JSON.stringify(payload)));
  const dadosParaAssinar = `${headerCodificado}.${payloadCodificado}`;

  const assinador = crypto.createSign('RSA-SHA256');
  assinador.update(dadosParaAssinar);
  assinador.end();
  const assinatura = assinador.sign(privateKey);

  return `${dadosParaAssinar}.${base64Url(assinatura)}`;
}

function requisicaoHttps(opcoes, corpo) {
  return new Promise((resolve, reject) => {
    const requisicao = https.request(opcoes, (resposta) => {
      let dados = '';
      resposta.on('data', (pedaco) => { dados += pedaco; });
      resposta.on('end', () => resolve({ status: resposta.statusCode, corpo: dados }));
    });
    requisicao.on('error', reject);
    if (corpo) requisicao.write(corpo);
    requisicao.end();
  });
}

async function obterTokenDeAcesso() {
  const { email, privateKey } = config.googleSheets;

  if (tokenCache && tokenCache.expiraEm > Date.now() + 30000) {
    return tokenCache.token;
  }

  const jwt = criarJwtAssinado(email, privateKey);
  const corpo = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`;

  const resposta = await requisicaoHttps({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(corpo),
    },
  }, corpo);

  let json;
  try {
    json = JSON.parse(resposta.corpo);
  } catch {
    throw new Error(`Resposta invalida ao pedir token (status ${resposta.status}): ${resposta.corpo.slice(0, 200)}`);
  }

  if (!json.access_token) {
    throw new Error(`Falha ao obter token (status ${resposta.status}): ${resposta.corpo}`);
  }

  tokenCache = {
    token: json.access_token,
    expiraEm: Date.now() + (json.expires_in || 3600) * 1000,
  };

  return tokenCache.token;
}

async function chamarApi(metodo, caminho, corpoObjeto) {
  const token = await obterTokenDeAcesso();
  const corpo = corpoObjeto ? JSON.stringify(corpoObjeto) : null;

  const resposta = await requisicaoHttps({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${caminho}`,
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(corpo ? { 'Content-Length': Buffer.byteLength(corpo) } : {}),
    },
  }, corpo);

  if (resposta.status < 200 || resposta.status >= 300) {
    throw new Error(`Sheets API respondeu ${resposta.status}: ${resposta.corpo}`);
  }

  return JSON.parse(resposta.corpo);
}

// Manda o registro do dia direto para a planilha via API oficial do Google
// Sheets. Se as credenciais nao estiverem configuradas, nao faz nada. Falha
// aqui nunca deve quebrar o bot: os dados ja estao salvos localmente antes
// dessa funcao ser chamada.
export async function sincronizarComPlanilha(dataKey, registro, tentativa = 1) {
  const { sheetId, email, privateKey } = config.googleSheets;
  if (!sheetId || !email || !privateKey) return;

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

    const leitura = await chamarApi('GET', `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A:A`)}`);
    let valoresColunaA = leitura.values || [];

    if (valoresColunaA.length === 0) {
      await chamarApi(
        'PUT',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A1`)}?valueInputOption=RAW`,
        { values: [CABECALHO] }
      );
      valoresColunaA = [CABECALHO];
    }

    let linhaEncontrada = -1;
    for (let i = 1; i < valoresColunaA.length; i++) {
      if (valoresColunaA[i][0] === dataKey) {
        linhaEncontrada = i + 1;
        break;
      }
    }

    if (linhaEncontrada > 0) {
      await chamarApi(
        'PUT',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A${linhaEncontrada}:E${linhaEncontrada}`)}?valueInputOption=RAW`,
        { values: [linha] }
      );
    } else {
      await chamarApi(
        'POST',
        `${sheetId}/values/${encodeURIComponent(`${NOME_ABA}!A:E`)}:append?valueInputOption=RAW`,
        { values: [linha] }
      );
    }
  } catch (erro) {
    if (tentativa < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return sincronizarComPlanilha(dataKey, registro, tentativa + 1);
    }
    console.error('Falha ao sincronizar com a planilha (dado ja esta salvo localmente):', erro.message);
  }
}
