import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// View principal de campanhas
router.get('/', (req, res) => {
    // Join campanhas com contatos
    const queryCampanhas = `
        SELECT c.*, co.nome as contato_nome,
        (SELECT COUNT(*) FROM fila_envio f WHERE f.campanha_id = c.id) as total_mensagens,
        (SELECT COUNT(*) FROM fila_envio f WHERE f.campanha_id = c.id AND f.status = 'ENVIADO') as enviadas,
        (SELECT COUNT(*) FROM fila_envio f WHERE f.campanha_id = c.id AND f.status = 'PENDENTE') as pendentes
        FROM campanhas c 
        LEFT JOIN contatos co ON c.contato_id = co.id 
        ORDER BY c.id DESC
    `;

    db.all(queryCampanhas, [], (err, campanhas) => {
        if (err) return res.status(500).send("Erro ao buscar campanhas");

        // Determina o status amigável de cada campanha
        campanhas.forEach(c => {
            if (c.total_mensagens === 0) c.friendlyStatus = 'Vazia';
            else if (c.pendentes === 0) c.friendlyStatus = 'Finalizado';
            else if (c.enviadas > 0) c.friendlyStatus = 'Em Andamento';
            else c.friendlyStatus = 'Agendado';
        });

        db.all("SELECT status, COUNT(*) as count FROM fila_envio GROUP BY status", [], (err, stats) => {
            if (err) return res.status(500).send("Erro ao buscar estatísticas");
            const statsObj = { PENDENTE: 0, ENVIADO: 0, ERRO: 0 };
            stats.forEach(s => statsObj[s.status] = s.count);

            db.all("SELECT id, nome, telefone FROM contatos ORDER BY nome ASC", [], (err, contatos) => {
                res.render('campanhas', {
                    title: 'ZBot - Campanhas',
                    campanhas,
                    contatosDocs: contatos,
                    stats: statsObj,
                    successMsg: req.query.success
                });
            });
        });
    });
});

// Criar nova campanha
router.post('/', (req, res) => {
    const { mensagem, delay_min, delay_max, recorrente, data_agendamento, random_library, contato_id } = req.body;
    const min = parseInt(delay_min);
    const max = parseInt(delay_max);
    const isRecorrente = recorrente === '1' ? 1 : 0;
    const useLibrary = random_library === '1' ? 1 : 0;
    const targetContatoId = contato_id ? parseInt(contato_id) : 0; // 0 significa TODOS

    if ((!useLibrary && !mensagem) || isNaN(min) || isNaN(max) || min > max) {
        return res.status(400).send("Dados inválidos");
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Insere a campanha salvando o contato_id (null se for global)
        const sqlCampanha = `
            INSERT INTO campanhas (mensagem, delay_min, delay_max, recorrente, random_library, contato_id) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(sqlCampanha, [
            mensagem || (useLibrary ? '[Biblioteca Aleatória]' : ''),
            min,
            max,
            isRecorrente,
            useLibrary,
            targetContatoId > 0 ? targetContatoId : null
        ], function (err) {
            if (err) {
                console.error(err);
                db.run('ROLLBACK');
                return res.status(500).send("Erro ao criar campanha");
            }

            const campanhaId = this.lastID;

            // Define a query de contatos baseado na escolha (Individual ou Todos)
            let queryContatos = 'SELECT id, telefone FROM contatos';
            let paramsContatos = [];

            if (targetContatoId > 0) {
                queryContatos = 'SELECT id, telefone FROM contatos WHERE id = ?';
                paramsContatos = [targetContatoId];
            }

            db.all(queryContatos, paramsContatos, (err, contatos) => {
                if (err) {
                    console.error(err);
                    db.run('ROLLBACK');
                    return res.status(500).send("Erro ao buscar contatos");
                }

                if (contatos.length === 0) {
                    db.run('COMMIT');
                    return res.redirect('/campanhas?success=no_contacts');
                }

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
                        return res.status(500).send(err.message === "Biblioteca vazia" ? "Erro: Cadastre frases no Acervo primeiro!" : "Erro ao buscar acervo");
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

// Editar Campanha
router.post('/:id/editar', (req, res) => {
    const id = req.params.id;
    const { mensagem, delay_min, delay_max } = req.body;

    db.run('UPDATE campanhas SET mensagem = ?, delay_min = ?, delay_max = ? WHERE id = ?',
        [mensagem, parseInt(delay_min), parseInt(delay_max), id], (err) => {
            if (err) return res.status(500).send("Erro ao editar campanha");
            res.redirect('/campanhas?success=editada');
        });
});

// Reiniciar Campanha (Disparar Novamente)
router.post('/:id/reiniciar', (req, res) => {
    const campanhaId = req.params.id;

    db.get('SELECT * FROM campanhas WHERE id = ?', [campanhaId], (err, campanha) => {
        if (err || !campanha) return res.status(404).send("Campanha não encontrada");

        let queryContatos = 'SELECT id, telefone FROM contatos';
        let paramsContatos = [];

        if (campanha.contato_id) {
            queryContatos = 'SELECT id, telefone FROM contatos WHERE id = ?';
            paramsContatos = [campanha.contato_id];
        }

        db.all(queryContatos, paramsContatos, (err, contatos) => {
            if (err || contatos.length === 0) return res.status(400).send("Sem contatos para reiniciar");

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const stmt = db.prepare('INSERT INTO fila_envio (contato_id, telefone, mensagem, agendado_para, status, campanha_id) VALUES (?, ?, ?, ?, ?, ?)');

                let currentTime = Date.now();

                // Se for biblioteca, precisamos de uma frase agora (ou sorteamos no loop)
                // Para simplificar e manter a lógica do POST original:
                db.all('SELECT texto FROM biblioteca', [], (err, biblioteca) => {
                    const frases = (biblioteca && biblioteca.length > 0) ? biblioteca.map(b => b.texto) : [campanha.mensagem];

                    contatos.forEach(contato => {
                        const randomDelay = Math.floor(Math.random() * (campanha.delay_max - campanha.delay_min + 1) + campanha.delay_min) * 1000;
                        currentTime += randomDelay;
                        const msgFinal = campanha.random_library ? frases[Math.floor(Math.random() * frases.length)] : frases[0];

                        stmt.run([contato.id, contato.telefone, msgFinal, new Date(currentTime).toISOString(), 'PENDENTE', campanhaId]);
                    });

                    stmt.finalize();
                    db.run('COMMIT', (err) => {
                        if (err) return res.status(500).send("Erro ao reiniciar");
                        res.redirect('/campanhas?success=reiniciada');
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
