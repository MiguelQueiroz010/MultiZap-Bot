import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// View principal de campanhas
router.get('/', (req, res) => {
    db.all('SELECT * FROM campanhas ORDER BY id DESC', [], (err, campanhas) => {
        if (err) return res.status(500).send("Erro ao buscar campanhas");

        db.all("SELECT status, COUNT(*) as count FROM fila_envio GROUP BY status", [], (err, stats) => {
            if (err) return res.status(500).send("Erro ao buscar estatísticas");

            const statsObj = { PENDENTE: 0, ENVIADO: 0, ERRO: 0 };
            stats.forEach(s => statsObj[s.status] = s.count);

            res.render('campanhas', {
                title: 'ZBot - Campanhas',
                campanhas,
                stats: statsObj,
                successMsg: req.query.success
            });
        });
    });
});

// Criar nova campanha
router.post('/', (req, res) => {
    const { mensagem, delay_min, delay_max, recorrente, data_agendamento, random_library } = req.body;
    const min = parseInt(delay_min);
    const max = parseInt(delay_max);
    const isRecorrente = recorrente === '1' ? 1 : 0;
    const useLibrary = random_library === '1' ? 1 : 0;

    if ((!useLibrary && !mensagem) || isNaN(min) || isNaN(max) || min > max) {
        return res.status(400).send("Dados inválidos");
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Insere a campanha
        db.run('INSERT INTO campanhas (mensagem, delay_min, delay_max, recorrente, random_library) VALUES (?, ?, ?, ?, ?)',
            [mensagem || (useLibrary ? '[Biblioteca Aleatória]' : ''), min, max, isRecorrente, useLibrary], function (err) {
                if (err) {
                    console.error(err);
                    db.run('ROLLBACK');
                    return res.status(500).send("Erro ao criar campanha");
                }

                const campanhaId = this.lastID;

                // Pega todos os contatos
                db.all('SELECT id, telefone FROM contatos', [], (err, contatos) => {
                    if (err) {
                        console.error(err);
                        db.run('ROLLBACK');
                        return res.status(500).send("Erro ao buscar contatos");
                    }

                    if (contatos.length === 0) {
                        db.run('COMMIT');
                        return res.redirect('/campanhas?success=no_contacts');
                    }

                    // Se usar biblioteca, busca as frases
                    const getFrases = (callback) => {
                        if (useLibrary) {
                            db.all('SELECT texto FROM biblioteca', [], (err, rows) => {
                                if (err) return callback(err);
                                if (rows.length === 0) return callback(new Error("Biblioteca vazia"));
                                callback(null, rows.map(r => r.texto));
                            });
                        } else {
                            callback(null, [mensagem]);
                        }
                    };

                    getFrases((err, frases) => {
                        if (err) {
                            console.error(err);
                            db.run('ROLLBACK');
                            return res.status(500).send(err.message === "Biblioteca vazia" ? "Erro: Cadastre frases na Biblioteca primeiro!" : "Erro ao buscar biblioteca");
                        }

                        const stmt = db.prepare('INSERT INTO fila_envio (contato_id, telefone, mensagem, agendado_para, status, campanha_id) VALUES (?, ?, ?, ?, ?, ?)');

                        let currentTime = Date.now();
                        if (data_agendamento) {
                            const parsedData = new Date(data_agendamento).getTime();
                            if (!isNaN(parsedData)) {
                                currentTime = parsedData;
                            }
                        }

                        contatos.forEach(contato => {
                            const randomDelay = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
                            currentTime += randomDelay;

                            const agendadoPara = new Date(currentTime).toISOString();

                            // Sorteia uma frase se usar library, senão usa a mensagem única
                            const msgFinal = useLibrary ? frases[Math.floor(Math.random() * frases.length)] : frases[0];

                            stmt.run([contato.id, contato.telefone, msgFinal, agendadoPara, 'PENDENTE', campanhaId]);
                        });

                        stmt.finalize();

                        db.run('COMMIT', (err) => {
                            if (err) {
                                console.error('Erro no commit da fila', err);
                                return res.status(500).send("Erro ao enfileirar mensagens");
                            }
                            res.redirect('/campanhas?success=criada');
                        });
                    });
                });
            });
    });
});

// Excluir Campanha
router.post('/:id/excluir', (req, res) => {
    const campanhaId = req.params.id;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Deleta os agendamentos pendentes ou com erro que pertencem àquela campanha
        db.run('DELETE FROM fila_envio WHERE campanha_id = ? AND status IN ("PENDENTE", "ERRO")', [campanhaId]);

        // Deleta a campanha do histórico
        db.run('DELETE FROM campanhas WHERE id = ?', [campanhaId], (err) => {
            if (err) {
                console.error("Erro deletar campanha", err);
                db.run('ROLLBACK');
                return res.status(500).send("Erro ao excluir campanha");
            }

            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).send("Erro no commit da exclusão");
                }
                res.redirect('/campanhas?success=excluida');
            });
        });
    });
});

export default router;
