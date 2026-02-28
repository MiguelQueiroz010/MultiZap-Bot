import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// Listar mensagens da biblioteca
router.get('/', (req, res) => {
    db.all('SELECT * FROM biblioteca ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao buscar biblioteca");
        }
        res.render('biblioteca', {
            title: 'ZBot - Biblioteca',
            biblioteca: rows,
            successMsg: req.query.success
        });
    });
});

// Adicionar mensagem à biblioteca
router.post('/', (req, res) => {
    const { texto } = req.body;

    if (!texto || texto.trim() === '') {
        return res.status(400).send("O texto da mensagem é obrigatório");
    }

    db.run('INSERT INTO biblioteca (texto) VALUES (?)', [texto.trim()], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao salvar mensagem na biblioteca");
        }
        res.redirect('/biblioteca?success=adicionado');
    });
});

// Excluir mensagem da biblioteca
router.post('/:id/excluir', (req, res) => {
    const id = req.params.id;

    db.run('DELETE FROM biblioteca WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao excluir mensagem da biblioteca");
        }
        res.redirect('/biblioteca?success=excluido');
    });
});

export default router;
