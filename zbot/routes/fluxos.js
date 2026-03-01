import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// Lista de Fluxos
router.get('/', (req, res) => {
    db.all('SELECT * FROM fluxos ORDER BY id DESC', [], (err, fluxos) => {
        if (err) return res.status(500).send("Erro ao buscar fluxos");

        // Em um app real faríamos um LEFT JOIN para trazer a contagem de etapas e contatos ativos
        res.render('fluxos/index', { title: 'ZBot - Fluxos', fluxos, successMsg: req.query.success });
    });
});

// Criar Fluxo
router.post('/', (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).send("Nome inválido");

    db.run('INSERT INTO fluxos (nome) VALUES (?)', [nome], function (err) {
        if (err) return res.status(500).send("Erro ao criar fluxo");
        res.redirect(`/fluxos/${this.lastID}`);
    });
});

// Detalhes do Fluxo (Ver etapas)
router.get('/:id', (req, res) => {
    const fluxoId = req.params.id;

    db.get('SELECT * FROM fluxos WHERE id = ?', [fluxoId], (err, fluxo) => {
        if (err || !fluxo) return res.status(404).send("Fluxo não encontrado");

        db.all('SELECT * FROM fluxo_etapas WHERE fluxo_id = ? ORDER BY ordem ASC', [fluxoId], (err, etapas) => {
            if (err) return res.status(500).send("Erro ao buscar etapas");

            db.get('SELECT COUNT(*) as count FROM execucao_fluxo WHERE fluxo_id = ? AND status = "ATIVO"', [fluxoId], (err, stats) => {
                res.render('fluxos/detalhes', {
                    title: `Fluxo: ${fluxo.nome}`,
                    fluxo,
                    etapas,
                    ativos: stats ? stats.count : 0,
                    successMsg: req.query.success
                });
            });
        });
    });
});

// Adicionar Etapa ao Fluxo
router.post('/:id/etapas', (req, res) => {
    const fluxoId = req.params.id;
    const { mensagem, delay_minutos } = req.body;

    // Calcula a ordem automaticamente baseada na última etapa
    db.get('SELECT MAX(ordem) as maxOrdem FROM fluxo_etapas WHERE fluxo_id = ?', [fluxoId], (err, row) => {
        const ordem = (row && row.maxOrdem) ? row.maxOrdem + 1 : 1;

        db.run('INSERT INTO fluxo_etapas (fluxo_id, mensagem, delay_minutos, ordem) VALUES (?, ?, ?, ?)',
            [fluxoId, mensagem, delay_minutos || 0, ordem], (err) => {
                if (err) return res.status(500).send("Erro ao adicionar etapa");
                res.redirect(`/fluxos/${fluxoId}?success=etapa_adicionada`);
            });
    });
});

// Editar Etapa do Fluxo
router.post('/etapa/:id/editar', (req, res) => {
    const etapaId = req.params.id;
    const { mensagem, delay_minutos, redirecionar_para_fluxo } = req.body;

    db.run('UPDATE fluxo_etapas SET mensagem = ?, delay_minutos = ? WHERE id = ?',
        [mensagem, delay_minutos || 0, etapaId], (err) => {
            if (err) return res.status(500).send("Erro ao editar etapa");
            res.redirect(`/fluxos/${redirecionar_para_fluxo}?success=etapa_editada`);
        });
});

// Ação: Iniciar Fluxo para a base
router.post('/:id/iniciar', (req, res) => {
    const fluxoId = req.params.id;

    db.get('SELECT id FROM fluxo_etapas WHERE fluxo_id = ? ORDER BY ordem ASC LIMIT 1', [fluxoId], (err, primeiraEtapa) => {
        if (err || !primeiraEtapa) return res.status(400).send("Fluxo não possui etapas para iniciar");

        db.all('SELECT id, telefone FROM contatos', [], (err, contatos) => {
            if (err || contatos.length === 0) return res.status(400).send("Sem contatos para iniciar");

            const stmt = db.prepare('INSERT OR IGNORE INTO execucao_fluxo (fluxo_id, contato_id, etapa_atual, proxima_execucao, status) VALUES (?, ?, ?, ?, ?)');
            const now = new Date().toISOString();

            contatos.forEach(c => {
                stmt.run([fluxoId, c.id, 1, now, 'ATIVO']);
            });

            stmt.finalize();
            res.redirect(`/fluxos/${fluxoId}?success=iniciado`);
        });
    });
});

// ------------ GESTÃO DE CONTATOS NO FLUXO ------------
// Listar contatos ativos e em erro num fluxo específico
router.get('/:id/ativos', (req, res) => {
    const fluxoId = req.params.id;

    db.get('SELECT * FROM fluxos WHERE id = ?', [fluxoId], (err, fluxo) => {
        if (err || !fluxo) return res.status(404).send("Fluxo não encontrado");

        const query = `
            SELECT 
                ef.id as execucao_id,
                ef.etapa_atual,
                ef.status,
                ef.proxima_execucao,
                c.nome,
                c.telefone
            FROM execucao_fluxo ef
            JOIN contatos c ON ef.contato_id = c.id
            WHERE ef.fluxo_id = ? AND ef.status IN ('ATIVO', 'ERRO')
            ORDER BY ef.proxima_execucao ASC
        `;

        db.all(query, [fluxoId], (err, contatosFluxo) => {
            if (err) return res.status(500).send("Erro ao buscar contatos ativos");
            res.render('fluxos/ativos', {
                title: `ZBot - Ativos no ${fluxo.nome}`,
                fluxo,
                contatosFluxo,
                successMsg: req.query.success
            });
        });
    });
});

// Ação: Cancelar execução de um contato no fluxo
router.post('/execucao/:id/cancelar', (req, res) => {
    const execId = req.params.id;
    const { redirecionar_para_fluxo } = req.body; // para saber pra onde voltar

    db.run('DELETE FROM execucao_fluxo WHERE id = ?', [execId], (err) => {
        if (err) return res.status(500).send("Erro ao cancelar");
        res.redirect(`/fluxos/${redirecionar_para_fluxo}/ativos?success=cancelado`);
    });
});

// Ação: Retomar execução com erro (volta pra ATIVO)
router.post('/execucao/:id/retomar', (req, res) => {
    const execId = req.params.id;
    const { redirecionar_para_fluxo } = req.body;
    const agoraStr = new Date().toISOString();

    // Tenta enviar para agora mesmo na mesma etapa
    db.run('UPDATE execucao_fluxo SET status = "ATIVO", proxima_execucao = ? WHERE id = ?', [agoraStr, execId], (err) => {
        if (err) return res.status(500).send("Erro ao retomar");
        res.redirect(`/fluxos/${redirecionar_para_fluxo}/ativos?success=retomado`);
    });
});

// Editar Nome do Fluxo
router.post('/:id/editar', (req, res) => {
    const { nome } = req.body;
    const id = req.params.id;

    if (!nome) return res.status(400).send("Nome inválido");

    db.run('UPDATE fluxos SET nome = ? WHERE id = ?', [nome.trim(), id], (err) => {
        if (err) return res.status(500).send("Erro ao editar fluxo");
        res.redirect('/fluxos?success=editado');
    });
});

// Ação: Excluir Fluxo inteiro (limpa filas e etapas)
router.post('/:id/excluir', (req, res) => {
    const fluxoId = req.params.id;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Remove os contatos em execução deste fluxo
        db.run('DELETE FROM execucao_fluxo WHERE fluxo_id = ?', [fluxoId]);

        // 2. Remove as etapas criadas
        db.run('DELETE FROM fluxo_etapas WHERE fluxo_id = ?', [fluxoId]);

        // 3. Deleta o fluxo
        db.run('DELETE FROM fluxos WHERE id = ?', [fluxoId], (err) => {
            if (err) {
                console.error("Erro deletar fluxo", err);
                db.run('ROLLBACK');
                return res.status(500).send("Erro ao excluir fluxo");
            }

            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).send("Erro no commit da exclusão");
                }
                res.redirect('/fluxos?success=excluido');
            });
        });
    });
});

export default router;
