import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// Listar filas
router.get('/', (req, res) => {
    const query = `
        SELECT 
            f.id,
            f.telefone,
            f.mensagem,
            f.agendado_para,
            f.status,
            c.nome
        FROM fila_envio f
        LEFT JOIN contatos c ON f.contato_id = c.id
        WHERE f.status IN ('PENDENTE', 'ERRO')
        ORDER BY f.agendado_para ASC
    `;

    db.all(query, [], (err, filas) => {
        if (err) return res.status(500).send("Erro ao buscar fila");
        res.render('filas/index', { title: 'ZBot - Gerenciar Filas', filas, successMsg: req.query.success });
    });
});

// Ação para cancelar (deletar) da fila
router.post('/:id/cancelar', (req, res) => {
    db.run("DELETE FROM fila_envio WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send("Erro ao deletar");
        res.redirect('/filas?success=cancelado');
    });
});

// Ação para repetir (voltar status pra PENDENTE)
router.post('/:id/repetir', (req, res) => {
    const agoraStr = new Date().toISOString();
    // Joga pra agora de novo
    db.run("UPDATE fila_envio SET status = 'PENDENTE', agendado_para = ? WHERE id = ?", [agoraStr, req.params.id], (err) => {
        if (err) return res.status(500).send("Erro ao repetir");
        res.redirect('/filas?success=repetido');
    });
});

export default router;
