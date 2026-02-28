import { db } from "../database/db.js";

// Recebe a instância do cliente WPPConnect autenticada
export function iniciarAgendador(client) {
    if (!client) {
        console.error("Tentativa de iniciar o agendador sem um cliente válido.");
        return;
    }

    console.log("✅ Iniciando Agendador de Filas em Plano de Fundo...");

    // Roda a cada 5 segundos no background do Node
    setInterval(async () => {
        const agoraStr = new Date().toISOString();

        // =============== 1. FILA SIMPLES (Campanhas) ===============
        const queryFila = `
            SELECT f.*, c.recorrente 
            FROM fila_envio f 
            LEFT JOIN campanhas c ON f.campanha_id = c.id
            WHERE f.status = 'PENDENTE' AND f.agendado_para <= ?
        `;

        db.all(queryFila, [agoraStr], async (err, mensagens) => {
            if (err) return console.error("Erro ao buscar fila_envio:", err);

            for (const msg of mensagens) {
                try {
                    await client.sendText(msg.telefone, msg.mensagem);
                    db.run("UPDATE fila_envio SET status = 'ENVIADO' WHERE id = ?", [msg.id]);
                    console.log(`[Campanha] Mensagem enviada para ${msg.telefone}`);

                    // Nova funcionalidade: Recorrência diária (clona task +24h)
                    if (msg.recorrente === 1 && msg.campanha_id) {
                        const nextDay = new Date(msg.agendado_para);
                        nextDay.setDate(nextDay.getDate() + 1); // Soma exatas 24 horas

                        db.run(
                            'INSERT INTO fila_envio (contato_id, telefone, mensagem, agendado_para, status, campanha_id) VALUES (?, ?, ?, ?, ?, ?)',
                            [msg.contato_id, msg.telefone, msg.mensagem, nextDay.toISOString(), 'PENDENTE', msg.campanha_id]
                        );
                        console.log(`[Recorrência] Nova repetição agendada para ${msg.telefone} em ${nextDay.toLocaleString("pt-BR")}`);
                    }

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
                    await client.sendText(exec.telefone, exec.mensagem);
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
                    // Update flow to ERRO instead of looping forever
                    db.run('UPDATE execucao_fluxo SET status = "ERRO" WHERE id = ?', [exec.execucao_id]);
                    console.error(`[Fluxo ${exec.fluxo_id}] Erro ao enviar etapa ${exec.etapa_atual} para ${exec.telefone}:`, error);
                }
            }
        });
    }, 5000);
}
