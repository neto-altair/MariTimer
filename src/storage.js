import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ate a v2.0 os dados ficavam dentro da propria pasta do projeto (data/).
// Isso e perigoso: qualquer forma de atualizar o bot que substitua a pasta
// inteira (apagar e clonar de novo, extrair um zip por cima, etc.) apaga
// junto o historico de batidas. A partir de agora o padrao fica fora da
// pasta do projeto, na home de quem roda o bot. Defina MARITIMER_DATA_DIR
// pra escolher outro lugar (ex: /app/data num volume do Railway).
const PASTA_ANTIGA = path.join(__dirname, '..', 'data');

export const PASTA_DADOS = process.env.MARITIMER_DATA_DIR
  || path.join(os.homedir(), '.maritimer-dados');

const DATA_FILE = path.join(PASTA_DADOS, 'registros.json');
const ARQUIVO_ANTIGO = path.join(PASTA_ANTIGA, 'registros.json');
const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups');
const MAX_BACKUPS = 14;

// Copia o arquivo antigo (se existir e o novo ainda nao existir) uma unica
// vez, pra quem ja tinha o bot rodando nao perder o historico com essa troca.
function migrarDadosAntigosSeNecessario() {
  if (fs.existsSync(DATA_FILE) || !fs.existsSync(ARQUIVO_ANTIGO)) return;
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  fs.copyFileSync(ARQUIVO_ANTIGO, DATA_FILE);
  console.log(`Registros antigos migrados de ${ARQUIVO_ANTIGO} para ${DATA_FILE}.`);
}

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
  migrarDadosAntigosSeNecessario();
  if (!fs.existsSync(PASTA_DADOS)) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

// Guarda uma copia diaria dos registros (rotacionando as mais antigas), pra
// ter uma segunda chance caso o arquivo principal seja perdido ou corrompido.
function fazerBackup(dados) {
  try {
    if (!fs.existsSync(PASTA_BACKUPS)) fs.mkdirSync(PASTA_BACKUPS, { recursive: true });

    const hoje = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(
      path.join(PASTA_BACKUPS, `registros-${hoje}.json`),
      JSON.stringify(dados, null, 2)
    );

    const backups = fs.readdirSync(PASTA_BACKUPS).filter((f) => f.startsWith('registros-')).sort();
    const excedentes = backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS));
    for (const arquivo of excedentes) {
      fs.unlinkSync(path.join(PASTA_BACKUPS, arquivo));
    }
  } catch (erro) {
    console.error('Falha ao gerar backup dos registros:', erro);
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
  fazerBackup(dados);
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
