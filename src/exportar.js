import * as storage from './storage.js';
import config from './config.js';

// Formata numero decimal no padrao usado pelo Excel/Sheets em portugues
// (virgula como separador decimal), pra abrir direto sem confundir formato.
function formatarNumero(valor) {
  if (valor === '' || valor === null || typeof valor === 'undefined') return '';
  return valor.toFixed(2).replace('.', ',');
}

function nomesDasColunasDeBatida() {
  const nomes = [];
  for (let i = 1; i <= config.batidasPorDia; i++) {
    const numeroDoPar = Math.ceil(i / 2);
    nomes.push(i % 2 === 1 ? `Entrada${numeroDoPar}` : `Saida${numeroDoPar}`);
  }
  return nomes;
}

// Gera o conteudo de um CSV (separado por ; e numeros com virgula, no
// padrao que o Excel em portugues abre corretamente sem precisar importar).
export function gerarCsv() {
  const dados = storage.carregarTudo();
  const datasOrdenadas = Object.keys(dados).sort();

  const cabecalho = ['Data', ...nomesDasColunasDeBatida(), 'HorasTrabalhadas', 'Esperado', 'Diferenca'];
  const linhas = [cabecalho.join(';')];

  for (const dataKey of datasOrdenadas) {
    const registro = dados[dataKey];
    const batidas = (registro.batidas || []).slice(0, config.batidasPorDia);

    const colunasDeHorario = [];
    for (let i = 0; i < config.batidasPorDia; i++) {
      colunasDeHorario.push(batidas[i] ? batidas[i].hora : '');
    }

    const horasTrabalhadas = typeof registro.horasTrabalhadas === 'number'
      ? registro.horasTrabalhadas
      : '';
    const diferenca = typeof registro.horasTrabalhadas === 'number'
      ? registro.horasTrabalhadas - config.horasPorDia
      : '';

    const linha = [
      dataKey,
      ...colunasDeHorario,
      formatarNumero(horasTrabalhadas),
      formatarNumero(config.horasPorDia),
      formatarNumero(diferenca),
    ];

    linhas.push(linha.join(';'));
  }

  return linhas.join('\n');
}
