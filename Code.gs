// Cole este código em Extensões > Apps Script, dentro da sua planilha do Google Sheets.
// Depois siga as instruções de implantação (deploy) no README do projeto.

const SEGREDO = 'TROQUE_POR_UMA_SENHA_SUA'; // use o mesmo valor no config.json do bot

function doPost(e) {
  const dados = JSON.parse(e.postData.contents);

  if (dados.secret !== SEGREDO) {
    return ContentService
      .createTextOutput('nao autorizado')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const planilhaAtiva = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilhaAtiva.getSheetByName('Registros')
    || planilhaAtiva.insertSheet('Registros');

  if (aba.getLastRow() === 0) {
    aba.appendRow(['Data', 'Entrada', 'Saida', 'Horas trabalhadas', 'Esperado', 'Diferenca']);
  }

  const linhaNova = [
    dados.data,
    dados.entrada || '',
    dados.saida || '',
    dados.horasTrabalhadas || '',
    dados.esperado || '',
    dados.diferenca || '',
  ];

  // procura se ja existe uma linha para essa data, para atualizar em vez de duplicar
  const valores = aba.getDataRange().getValues();
  let linhaEncontrada = -1;
  for (let i = 1; i < valores.length; i++) {
    if (valores[i][0] === dados.data) {
      linhaEncontrada = i + 1; // +1 porque a planilha comeca em 1, nao em 0
      break;
    }
  }

  if (linhaEncontrada > 0) {
    aba.getRange(linhaEncontrada, 1, 1, linhaNova.length).setValues([linhaNova]);
  } else {
    aba.appendRow(linhaNova);
  }

  return ContentService
    .createTextOutput('ok')
    .setMimeType(ContentService.MimeType.TEXT);
}
