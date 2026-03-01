import { db } from "../database/db.js";

let agendadorInterval = null;

// Recebe a instância do cliente WPPConnect autenticada
export function iniciarAgendador(client) {
    if (!client) {
        console.error("Tentativa de iniciar o agendador sem um cliente válido.");
        return;
    }

    // Se já houver um agendador rodando, limpa para não duplicar
    if (agendadorInterval) {
        clearInterval(agendadorInterval);
        console.log("🔄 Agendador anterior interrompido.");
    }

    console.log("✅ Iniciando Agendador de Filas em Plano de Fundo...");

    agendadorInterval = setInterval(async () => {
        const agoraStr = new Date().toISOString();

        // =============== 1. FILA DE CAMPANHAS ===============
        // Buscamos as mensagens PENDENTES
        db.all("SELECT id FROM fila_envio WHERE status = 'PENDENTE' AND agendado_para <= ?", [agoraStr], (err, rows) => {
            if (err) return console.error("Erro ao buscar IDs da fila:", err);
            if (!rows || rows.length === 0) return;

            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');

            // Marcamos todas como 'PROCESSANDO' imediatamente para que o próximo intervalo não as pegue
            db.run(`UPDATE fila_envio SET status = 'PROCESSANDO' WHERE id IN (${placeholders})`, ids, (err) => {
                if (err) return console.error("Erro ao travar mensagens da fila:", err);

                // Agora buscamos os dados completos apenas das mensagens que travamos
                const queryDados = `
                    SELECT f.*, c.recorrente, c.random_library
                    FROM fila_envio f 
                    LEFT JOIN campanhas c ON f.campanha_id = c.id
                    WHERE f.id IN (${placeholders})
                `;

                db.all(queryDados, ids, async (err, mensagens) => {
                    if (err) return console.error("Erro ao buscar dados da fila travada:", err);

                    for (const msg of mensagens) {
                        try {
                            await client.sendText(msg.telefone, msg.mensagem);
                            db.run("UPDATE fila_envio SET status = 'ENVIADO' WHERE id = ?", [msg.id]);
                            console.log(`[Campanha] Mensagem enviada para ${msg.telefone}`);

                            if (msg.recorrente === 1 && msg.campanha_id) {
                                const nextDay = new Date(msg.agendado_para);
                                nextDay.setDate(nextDay.getDate() + 1);

                                if (msg.random_library === 1) {
                                    db.get("SELECT texto FROM biblioteca ORDER BY RANDOM() LIMIT 1", [], (err, row) => {
                                        const msgTexto = row ? row.texto : msg.mensagem;
                                        db.run(
                                            'INSERT INTO fila_envio (contato_id, telefone, mensagem, agendado_para, status, campanha_id) VALUES (?, ?, ?, ?, ?, ?)',
                                            [msg.contato_id, msg.telefone, msgTexto, nextDay.toISOString(), 'PENDENTE', msg.campanha_id]
                                        );
                                    });
                                } else {
                                    db.run(
                                        'INSERT INTO fila_envio (contato_id, telefone, mensagem, agendado_para, status, campanha_id) VALUES (?, ?, ?, ?, ?, ?)',
                                        [msg.contato_id, msg.telefone, msg.mensagem, nextDay.toISOString(), 'PENDENTE', msg.campanha_id]
                                    );
                                }
                            }
                        } catch (error) {
                            db.run("UPDATE fila_envio SET status = 'ERRO' WHERE id = ?", [msg.id]);
                            console.error(`[Campanha] Erro ao enviar para ${msg.telefone}:`, error);
                        }
                    }
                });
            });
        });

        // =============== 2. FLUXOS (Automações) ===============
        // Aplicamos a mesma lógica de trava para os fluxos
        db.all("SELECT id FROM execucao_fluxo WHERE status = 'ATIVO' AND proxima_execucao <= ?", [agoraStr], (err, rows) => {
            if (err) return console.error("Erro ao buscar IDs de fluxo:", err);
            if (!rows || rows.length === 0) return;

            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');

            db.run(`UPDATE execucao_fluxo SET status = 'PROCESSANDO' WHERE id IN (${placeholders})`, ids, (err) => {
                if (err) return console.error("Erro ao travar execuções de fluxo:", err);

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
                    WHERE ef.id IN (${placeholders})
                `;

                db.all(queryFluxos, ids, async (err, execucoes) => {
                    if (err) return console.error("Erro ao buscar dados de fluxo travados:", err);

                    for (const exec of execucoes) {
                        try {
                            await client.sendText(exec.telefone, exec.mensagem);

                            db.get('SELECT delay_minutos FROM fluxo_etapas WHERE fluxo_id = ? AND ordem = ?', [exec.fluxo_id, exec.etapa_atual + 1], (err, proximaEtapa) => {
                                if (proximaEtapa) {
                                    const proxData = new Date();
                                    proxData.setMinutes(proxData.getMinutes() + proximaEtapa.delay_minutos);
                                    db.run('UPDATE execucao_fluxo SET status = "ATIVO", etapa_atual = ?, proxima_execucao = ? WHERE id = ?',
                                        [exec.etapa_atual + 1, proxData.toISOString(), exec.execucao_id]);
                                } else {
                                    db.run('UPDATE execucao_fluxo SET status = "CONCLUIDO" WHERE id = ?', [exec.execucao_id]);
                                }
                            });
                        } catch (error) {
                            db.run('UPDATE execucao_fluxo SET status = "ERRO" WHERE id = ?', [exec.execucao_id]);
                        }
                    }
                });
            });
        });
    }, 5000);
}
