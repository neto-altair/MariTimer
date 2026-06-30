# Ponto Bot

Bot de WhatsApp para registrar horario de entrada e saida do trabalho, e calcular
automaticamente hora extra ou hora faltando.

Usa a biblioteca **Baileys**, que conecta direto no WhatsApp por WebSocket —
sem precisar de navegador/Chromium. Por isso roda bem em aparelhos fracos,
incluindo um celular Android via Termux.

## O que ele faz

Voce manda mensagens pelo WhatsApp e o bot responde:

- `entrada` ou `entrada 08:00` -> registra a entrada (hora atual ou a informada)
- `saida` ou `saida 17:00` -> registra a saida e calcula o saldo do dia
- `saldo` -> mostra o saldo acumulado do mes (positivo = hora extra, negativo = faltando)
- `ajuda` -> lista os comandos

Jornada padrao: 8h por dia, segunda a sexta. Para mudar, edite `config.json`.

## Sobre o numero do WhatsApp do bot

O bot precisa de um numero de WhatsApp proprio (a "conta do bot"), separado
do numero pessoal de quem vai mandar as mensagens. Para parear:

1. Decida qual numero vai ser o do bot (pode ser um chip pre-pago barato,
   ou ate um numero que voce ja tenha disponivel).
2. Instale o WhatsApp normal com esse numero em qualquer celular (pode ser
   emprestado so para este passo de pareamento).
3. Quando o bot rodar pela primeira vez, ele mostra um QR code no terminal.
4. Nesse celular com o WhatsApp do bot, va em **Aparelhos conectados >
   Conectar um aparelho** e escaneie o QR code.
5. Pronto, o pareamento fica salvo. Depois disso esse celular auxiliar nao
   precisa mais ficar envolvido — quem fica rodando o bot e o aparelho do
   passo abaixo (o M13).

## Sincronizar com Google Sheets (validar e ter backup pelo PC)

Os dados continuam salvos localmente no celular (`data/registros.json`), mas
o bot tambem pode mandar cada registro para uma planilha do Google Sheets.
Assim voce acessa e confere tudo pelo navegador no PC, e como a planilha fica
no seu Google Drive, o backup ja vem junto.

### Configurar a planilha

1. Crie uma planilha nova em https://sheets.google.com.
2. Va em **Extensoes > Apps Script**.
3. Apague o conteudo padrao e cole o conteudo do arquivo
   `google-apps-script/Code.gs` (esta na pasta do projeto).
4. Troque a linha `const SEGREDO = 'TROQUE_POR_UMA_SENHA_SUA';` por uma senha
   sua (qualquer texto, serve como um token simples pra ninguem mais
   conseguir escrever na sua planilha).
5. Clique em **Implantar > Nova implantacao**.
6. Em "Tipo", escolha **App da Web**.
7. Em "Quem pode acessar", escolha **Qualquer pessoa** (e necessario para o
   bot conseguir chamar o link de fora do Google).
8. Clique em Implantar, autorize as permissoes pedidas, e copie a **URL do
   app da Web** gerada (algo como `https://script.google.com/macros/s/.../exec`).

### Configurar o bot

Copie o `.env.example` para um arquivo chamado `.env` e preencha:

```
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/SEU_ID_AQUI/exec
GOOGLE_SHEETS_SECRET=a-mesma-senha-que-voce-colocou-no-Code.gs
```

Reinicie o bot (`Ctrl+C` e `npm start` de novo). A partir dai, toda vez que
alguem mandar `entrada` ou `saida`, uma linha na planilha "Registros" e
criada ou atualizada automaticamente.

Se quiser desativar essa sincronizacao depois, basta deixar as duas linhas
do `.env` vazias — o bot volta a funcionar so com o arquivo local, sem dar
erro.

**O arquivo `.env` nunca deve ser enviado para o GitHub** (ja vem protegido
no `.gitignore` deste projeto). Veja a secao abaixo.

## Publicando o repositorio no GitHub com seguranca

Dois tipos de informacao neste projeto nao podem ir para um repositorio
publico (nem privado, idealmente):

- **A pasta `data/`**: contem a sessao autenticada do WhatsApp
  (`data/sessao`). Quem tiver acesso a esses arquivos consegue se passar
  pelo seu bot no WhatsApp sem precisar escanear QR code de novo. Contém
  também o `registros.json`, com os horarios.
- **O arquivo `.env`**: contem a senha e a URL da planilha. Quem tiver isso
  consegue escrever dados falsos na sua planilha.

O `.gitignore` incluido no projeto ja exclui `data/`, `.env` e
`node_modules/` automaticamente. Antes do primeiro `git push`, confirme que
esses itens nao vao ser enviados:

```
git status
```

Se `data/` ou `.env` aparecerem na lista de arquivos a serem commitados, **pare**
e confira se o `.gitignore` esta na raiz do projeto e se o nome dos arquivos
bate exatamente.

### Se voce ja deu push de algum segredo por engano

Remover o arquivo depois nao basta — ele continua no historico do Git, e
qualquer um pode ver commits antigos. Nesse caso, o caminho mais simples e:

1. Trocar a senha do `Code.gs` na planilha e reimplantar (gera uma nova
   URL de webhook).
2. Apagar e recriar a pasta `data/sessao` no celular, rodar o bot de novo e
   escanear o QR code outra vez (a sessao antiga fica invalidada).
3. Se possivel, apagar o repositorio no GitHub e subir um novo, limpo, em
   vez de tentar "limpar" o historico do antigo.

Dessa forma os segredos antigos (que ja vazaram) perdem a validade.

## Como rodar no Termux (Galaxy M13 ou outro Android)

1. Instale o **Termux** pela F-Droid (https://f-droid.org/packages/com.termux/).
   Evite a versao da Play Store, que esta desatualizada.
2. Abra o Termux e rode:

   ```
   pkg update && pkg upgrade
   pkg install nodejs git
   ```

3. Coloque os arquivos do projeto no celular. Mais facil: suba para um
   repositorio no GitHub e clone:

   ```
   git clone <url-do-seu-repositorio> ponto-bot
   cd ponto-bot
   ```

   (Alternativa sem GitHub: copie a pasta via cabo/Google Drive para a
   pasta Download do celular, rode `termux-setup-storage` no Termux para
   liberar acesso, e depois `cp -r /sdcard/Download/ponto-bot ~/`.)

4. Instale as dependencias e inicie:

   ```
   npm install
   npm start
   ```

5. O QR code aparece direto no terminal do Termux. Siga o pareamento
   descrito na secao acima.

### Deixar rodando o tempo todo

Por padrao o Android mata processos em segundo plano para economizar
bateria. Para o bot ficar sempre ativo:

- Nas configuracoes do Android, em Bateria, desative a otimizacao de
  bateria para o Termux (deixe como "sem restricoes").
- Dentro do Termux, rode `termux-wake-lock` antes de iniciar o bot — isso
  evita que o sistema suspenda o processo.
- Instale o complemento **Termux:Boot** (tambem pela F-Droid) para o bot
  iniciar sozinho quando o celular reiniciar. Depois de instalado, crie o
  arquivo `~/.termux/boot/start-bot.sh` com:

  ```
  #!/data/data/com.termux/files/usr/bin/sh
  termux-wake-lock
  cd ~/ponto-bot
  npm start
  ```

  E de permissao de execucao: `chmod +x ~/.termux/boot/start-bot.sh`.
- Deixe o celular sempre carregando e conectado ao WiFi.

### Limitacoes, para ser direto

- Se o WhatsApp mudar o protocolo, o Baileys pode parar de funcionar ate
  ser atualizado (`npm update`). E uma biblioteca nao oficial.
- Se o Termux travar ou o celular reiniciar sem o Termux:Boot configurado,
  o bot para ate voce abrir o app e rodar `npm start` de novo.
- Os dados ficam em `data/registros.json`, dentro da pasta do projeto no
  proprio celular. Vale fazer backup de vez em quando (copiar esse arquivo
  para a nuvem ou outro lugar).

## Alternativa: rodar na nuvem (Railway)

Sem custo de manter o celular ligado, mas com mensalidade. Sem o Chromium,
o consumo de recursos e bem menor que antes, mas ainda assim o Railway nao
tem plano gratuito permanente: apos o trial de 30 dias (US$5 de credito),
o uso continuo exige o plano Hobby (US$5/mes).

1. Suba o projeto para um repositorio no GitHub.
2. No Railway, crie um projeto e escolha "Deploy from GitHub repo". Ele
   detecta o `Dockerfile` automaticamente.
3. Adicione um **Volume** montado em `/app/data`, para a sessao e os
   registros nao se perderem a cada deploy.
4. Acompanhe os logs do deployment para escanear o QR code.

## Personalizar

Edite `config.json`:

```json
{
  "horasPorDia": 8,
  "diasUteis": [1, 2, 3, 4, 5]
}
```

`diasUteis` usa 0 para domingo, 1 para segunda, e assim por diante.
