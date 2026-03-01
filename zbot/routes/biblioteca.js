import express from 'express';
import { db } from '../database/db.js';

const router = express.Router();

// Listar mensagens da biblioteca
router.get('/', (req, res) => {
    db.all('SELECT * FROM biblioteca ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao buscar acervo");
        }
        res.render('biblioteca', {
            title: 'ZBot - Acervo',
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
            return res.status(500).send("Erro ao salvar mensagem no acervo");
        }
        res.redirect('/biblioteca?success=adicionado');
    });
});

// Ação: Editar Mensagem do Acervo
router.post('/:id/editar', (req, res) => {
    const id = req.params.id;
    const { texto } = req.body;

    if (!texto) return res.status(400).send("O texto da mensagem é obrigatório");

    db.run('UPDATE biblioteca SET texto = ? WHERE id = ?', [texto.trim(), id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao editar mensagem no acervo");
        }
        res.redirect('/biblioteca?success=editado');
    });
});

// Excluir mensagem da biblioteca
router.post('/:id/excluir', (req, res) => {
    const id = req.params.id;

    db.run('DELETE FROM biblioteca WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao excluir mensagem do acervo");
        }
        res.redirect('/biblioteca?success=excluido');
    });
});

export default router;
