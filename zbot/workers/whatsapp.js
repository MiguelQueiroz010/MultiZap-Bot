import { create } from '@wppconnect-team/wppconnect';

export let client = null;

export async function startWhatsApp() {
  try{
  client = await create({
      session: 'sessionName',
      catchQR: (base64Qrimg, asciiQR, attempts) => {
        console.log('Tentativas:', attempts);
        console.log(asciiQR);
      }
    });
    console.log("WhatsApp conectado! ✅");
    receberMensagem();
  }
  catch(error) {
      console.log("Erro ao iniciar WhatsApp: ", error);
  }
}

function receberMensagem()
{
  client.onMessage(async (message) => {
    console.log('Mensagem recebida: ', message);
    // Aqui você pode adicionar lógica para responder ou processar a mensagem

     if (message.body === 'Hello') {
      client
        .sendText(message.from, 'Hello, how I may help you?')
        .then((result) => {
          console.log('Result: ', result); //return object success
        })
        .catch((erro) => {
          console.error('Error when sending: ', erro); //return object error
        });
      }
  });
}

export async function enviarMensagem(telefone, mensagem) {
  if (!client) {
    throw new Error("WhatsApp ainda não iniciado.");
  }

  try {
    const result = await client.sendText(telefone, mensagem);
    console.log('✅ Mensagem enviada:', result);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
  }
}