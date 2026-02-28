import { startWhatsApp, enviarMensagem, client } from "./workers/whatsapp.js";

const filaEnvio = [
  {
    id: 1,
    contatoId: 10,
    telefone: "553192952309@c.us",
    mensagem: "Olá, isso é um teste",
    executarEm: new Date(Date.now() - 1000),
    status: "PENDENTE"
  },
  {
    id: 2,
    contatoId: 10,
    telefone: "553192952309@c.us",
    mensagem: '❤️ "Façam tudo com amor." ❤️\n🌸✨ 🕊️ ✨🌸\nQue o amor seja a base de cada palavra e ação do seu dia. 🌷😊',
    executarEm: new Date(Date.now() - 9000),
    status: "PENDENTE"
  }
];

async function processarFila() {
  const agora = new Date();

  // Filtra mensagens pendentes e que já passaram do horário
  const pendentes = filaEnvio.filter(
    msg => msg.status === "PENDENTE" && msg.executarEm <= agora
  );

  if (pendentes.length > 0) {
    console.log(`Processando ${pendentes.length} mensagens...`);
  }

  for (const msg of pendentes) {
    try {
      await enviarMensagem(msg.telefone, msg.mensagem);
      msg.status = "ENVIADO";
      console.log(`Mensagem enviada para ${msg.telefone}`);
    } catch (error) {
      console.error(`Erro ao enviar para ${msg.telefone}:`, error);
    }
  }
}

// Inicia o processo de login
startWhatsApp();

/**
 * Em vez de um IF imediato, usamos um intervalo para checar 
 * se o cliente conectou, ou melhor ainda, exporte o evento no seu worker.
 */
const checarConexao = setInterval(() => {
  if (client) { // Verifica se o client existe e se já tem info (logado)
    console.log("WhatsApp conectado com sucesso! Iniciando processamento da fila...");
    
    // Inicia o loop da fila
    setInterval(processarFila, 5000);
    
    // Para de checar a conexão, pois já conectou
    clearInterval(checarConexao);
  } else {
    console.log("Aguardando conexão do WhatsApp...");
  }
}, 3000);