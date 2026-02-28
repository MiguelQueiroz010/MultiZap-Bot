import { startWhatsApp, enviarMensagem, client } from "./workers/whatsapp.js";
import { db } from "./database/db.js";

async function processarFilas() {
  const agoraStr = new Date().toISOString();

  // =============== 1. FILA SIMPLES (Campanhas) ===============
  db.all("SELECT * FROM fila_envio WHERE status = 'PENDENTE' AND agendado_para <= ?", [agoraStr], async (err, mensagens) => {
    if (err) return console.error("Erro ao buscar fila_envio:", err);

    for (const msg of mensagens) {
      try {
        await enviarMensagem(msg.telefone, msg.mensagem);
        db.run("UPDATE fila_envio SET status = 'ENVIADO' WHERE id = ?", [msg.id]);
        console.log(`[Campanha] Mensagem enviada para ${msg.telefone}`);
      } catch (error) {
        db.run("UPDATE fila_envio SET status = 'ERRO' WHERE id = ?", [msg.id]);
        console.error(`[Campanha] Erro ao enviar para ${msg.telefone}:`, error);
      }
    }
  });

  // =============== 2. FLUXOS (Automações) ===============
  const queryFluxos = `
        SELECT 
            ef.id as execucao_id,
            ef.fluxo_id,
            ef.etapa_atual,
            c.telefone,
            fe.mensagem,
            fe.delay_minutos
        FROM execucao_fluxo ef
        JOIN contatos c ON ef.contato_id = c.id
        JOIN fluxo_etapas fe ON ef.fluxo_id = fe.fluxo_id AND ef.etapa_atual = fe.ordem
        WHERE ef.status = 'ATIVO' AND ef.proxima_execucao <= ?
    `;

  db.all(queryFluxos, [agoraStr], async (err, execucoes) => {
    if (err) return console.error("Erro ao buscar execucao_fluxo:", err);

    for (const exec of execucoes) {
      try {
        // Envia a mensagem da etapa atual
        await enviarMensagem(exec.telefone, exec.mensagem);
        console.log(`[Fluxo ${exec.fluxo_id}] Etapa ${exec.etapa_atual} enviada para ${exec.telefone}`);

        // Verifica se tem uma próxima etapa
        db.get('SELECT delay_minutos FROM fluxo_etapas WHERE fluxo_id = ? AND ordem = ?', [exec.fluxo_id, exec.etapa_atual + 1], (err, proximaEtapa) => {
          if (proximaEtapa) {
            // Calcula nova data se existir proxima etapa
            const proxData = new Date();
            proxData.setMinutes(proxData.getMinutes() + proximaEtapa.delay_minutos);

            db.run('UPDATE execucao_fluxo SET etapa_atual = ?, proxima_execucao = ? WHERE id = ?',
              [exec.etapa_atual + 1, proxData.toISOString(), exec.execucao_id]);
          } else {
            // Se não tem próxima etapa, concluiu o fluxo
            db.run('UPDATE execucao_fluxo SET status = "CONCLUIDO" WHERE id = ?', [exec.execucao_id]);
          }
        });

      } catch (error) {
        console.error(`[Fluxo ${exec.fluxo_id}] Erro ao enviar etapa ${exec.etapa_atual} para ${exec.telefone}:`, error);
      }
    }
  });
}

// Inicia o processo de login do WhatsApp
startWhatsApp();

const checarConexao = setInterval(() => {
  if (client) {
    console.log("WhatsApp conectado com sucesso! Iniciando Worker...");

    // Roda a verificação das filas a cada 5 segundos
    setInterval(processarFilas, 5000);

    clearInterval(checarConexao);
  } else {
    console.log("Aguardando QRCode ou re-conexão do WhatsApp...");
  }
}, 3000);