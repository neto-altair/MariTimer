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
