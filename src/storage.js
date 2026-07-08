import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'registros.json');

function ehRegistroDeDia(valor) {
  return valor && typeof valor === 'object' && Array.isArray(valor.batidas);
}

// Versoes antigas guardavam os registros direto por data, sem separar por
// numero de quem bateu o ponto. Migra esse formato pra dentro de um usuario
// generico, pra nao perder o historico ao atualizar o bot.
function migrarFormatoAntigoSeNecessario(dados) {
  const chavesAntigas = Object.keys(dados).filter((chave) => ehRegistroDeDia(dados[chave]));
  if (chavesAntigas.length === 0) return dados;

  const migrados = { ...dados };
  migrados._legado = migrados._legado || {};
  for (const dataKey of chavesAntigas) {
    migrados._legado[dataKey] = migrados[dataKey];
    delete migrados[dataKey];
  }
  return migrados;
}

function garantirArquivo() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

// Estrutura salva: { [jid]: { "YYYY-MM-DD": { batidas: [...], horasTrabalhadas } } }
// jid identifica o numero de WhatsApp de quem bateu o ponto, permitindo que
// varias pessoas usem o mesmo bot sem misturar os registros.
export function carregarTudo() {
  garantirArquivo();
  const conteudo = fs.readFileSync(DATA_FILE, 'utf-8');
  return migrarFormatoAntigoSeNecessario(JSON.parse(conteudo));
}

function salvarTudo(dados) {
  garantirArquivo();
  fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 2));
}

// todos os registros ("YYYY-MM-DD" -> registro) de um unico usuario
export function getRegistrosDoUsuario(jid) {
  const dados = carregarTudo();
  return dados[jid] || {};
}

export function getRegistroDoDia(jid, dataKey) {
  const dados = carregarTudo();
  return dados[jid]?.[dataKey] || null;
}

export function salvarRegistroDoDia(jid, dataKey, registro) {
  const dados = carregarTudo();
  if (!dados[jid]) dados[jid] = {};
  dados[jid][dataKey] = registro;
  salvarTudo(dados);
}
