import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'registros.json');

function garantirArquivo() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

export function carregarTudo() {
  garantirArquivo();
  const conteudo = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(conteudo);
}

function salvarTudo(dados) {
  garantirArquivo();
  fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 2));
}

// dataKey no formato YYYY-MM-DD
export function getRegistroDoDia(dataKey) {
  const dados = carregarTudo();
  return dados[dataKey] || null;
}

export function salvarRegistroDoDia(dataKey, registro) {
  const dados = carregarTudo();
  dados[dataKey] = registro;
  salvarTudo(dados);
}
