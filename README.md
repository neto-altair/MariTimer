# Ponto Bot

Bot de WhatsApp para registrar horario de entrada e saida do trabalho, e calcular
automaticamente hora extra ou hora faltando.

## O que ele faz

Voce manda mensagens pelo WhatsApp e o bot responde:

- `entrada` ou `entrada 08:00` -> registra a entrada (hora atual ou a informada)
- `saida` ou `saida 17:00` -> registra a saida e calcula o saldo do dia
- `saldo` -> mostra o saldo acumulado do mes (positivo = hora extra, negativo = faltando)
- `ajuda` -> lista os comandos

Jornada padrao: 8h por dia, segunda a sexta. Para mudar, edite `config.json`.

## Requisitos

- Node.js instalado (versao 18 ou superior)
- Um computador ou servidor que possa ficar ligado (o bot precisa estar rodando
  para responder as mensagens)
- O WhatsApp do celular que vai enviar os registros (a conexao usa o WhatsApp Web,
  entao o celular precisa ter internet, mas nao precisa ficar com o app aberto o
  tempo todo)

## Como instalar

1. Baixe esta pasta para o computador/servidor onde o bot vai rodar.
2. Abra um terminal dentro da pasta `ponto-bot`.
3. Instale as dependencias:

   ```
   npm install
   ```

4. Inicie o bot:

   ```
   npm start
   ```

5. Vai aparecer um QR code no terminal. No celular, abra o WhatsApp, va em
   **Configuracoes > Aparelhos conectados > Conectar um aparelho** e escaneie o
   QR code.

6. Pronto. O bot fica escutando mensagens. Mande `entrada` para testar.

## Importante

- O bot so responde a mensagens enviadas para o numero/conta conectada
  (incluindo mensagens que voce manda para si mesmo, no "Mensagens para mim").
  Se quiser que ele responda a varias pessoas, qualquer um que mandar mensagem
  para esse numero vai acionar os comandos.
- Os dados ficam salvos em `data/registros.json`, na propria pasta do projeto.
  Faca backup desse arquivo de vez em quando.
- Essa biblioteca (whatsapp-web.js) e gratuita, mas nao e oficial. Ela funciona
  bem para uso pessoal, mas pode quebrar quando o WhatsApp muda alguma coisa
  internamente — nesse caso, normalmente um `npm update` resolve.
- Para o bot continuar rodando mesmo apos fechar o terminal, use uma ferramenta
  como `pm2` (`npm install -g pm2` e depois `pm2 start src/bot.js`).

## Personalizar

Edite `config.json`:

```json
{
  "horasPorDia": 8,
  "diasUteis": [1, 2, 3, 4, 5]
}
```

`diasUteis` usa 0 para domingo, 1 para segunda, e assim por diante.
