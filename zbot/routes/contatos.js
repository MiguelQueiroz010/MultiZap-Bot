import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { db } from '../database/db.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// View principal de contatos
router.get('/', (req, res) => {
    db.all('SELECT * FROM contatos', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao buscar contatos");
        }
        res.render('contatos', { title: 'ZBot - Contatos', contatos: rows, successMsg: req.query.success });
    });
});

// Endpoint de upload do CSV
router.post('/import', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('Nenhum arquivo enviado.');
    }

    const results = [];

    // O csv-parser agora mapeia os cabeçalhos para minúsculo e remove o BOM
    fs.createReadStream(req.file.path)
        .pipe(csv({
            mapHeaders: ({ header }) => header.toLowerCase().replace(/[\uFEFF\u200B]/g, '').trim()
        }))
        .on('data', (data) => {
            // Tenta achar o nome em diferentes formatos possíveis
            const nome = data['name'] || data['given name'] || data['first name'] || data['nome'] || data['first'];

            // Tenta achar o telefone no formato do Google, Outlook, ou simples
            const telefoneRaw = data['phone 1 - value'] || data['phone 1'] || data['phone'] || data['primary phone'] || data['mobile phone'] || data['telefone'] || data['celular'];

            if (nome && telefoneRaw) {
                results.push({
                    nome: nome,
                    telefone: telefoneRaw
                });
            }
        })
        .on('end', () => {
            fs.unlinkSync(req.file.path); // Remove o arquivo

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const stmt = db.prepare('INSERT OR IGNORE INTO contatos (nome, telefone) VALUES (?, ?)');

                results.forEach(row => {
                    let cleanPhone = row.telefone.replace(/\D/g, ''); // Limpa os não numéricos

                    // Regra: Se começa com 55 (Brasil), tem DDD (2 dgt), começa com 9 e tem 8 dgt depois (total 13 dígitos)
                    if (cleanPhone.length === 13 && cleanPhone.startsWith('55') && cleanPhone.charAt(4) === '9') {
                        // Corta o "9" fora (Pega o '55' + 'DDD' + os 8 ultimos numeros)
                        cleanPhone = cleanPhone.substring(0, 4) + cleanPhone.substring(5);
                    }

                    if (cleanPhone.length > 5) { // Validação basica pra não pegar telefones super curtos acidentalmente
                        const finalPhone = cleanPhone.endsWith('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;
                        stmt.run([row.nome.trim(), finalPhone]);
                    }
                });

                stmt.finalize();
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Erro na transaction', err);
                        return res.status(500).send("Erro ao importar contatos");
                    }
                    res.redirect('/contatos?success=importado');
                });
            });
        })
        .on('error', (err) => {
            console.error('Erro ao ler CSV', err);
            res.status(500).send("Erro ao ler o arquivo CSV");
        });
});

// Ação: Excluir Contato
router.post('/:id/excluir', (req, res) => {
    const contatoId = req.params.id;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Limpa de onde esse contato poderia estar no banco (filas ativas e fluxos)
        db.run('DELETE FROM fila_envio WHERE contato_id = ?', [contatoId]);
        db.run('DELETE FROM execucao_fluxo WHERE contato_id = ?', [contatoId]);

        // Deleta o contato da base
        db.run('DELETE FROM contatos WHERE id = ?', [contatoId], (err) => {
            if (err) {
                console.error("Erro deletar contato", err);
                db.run('ROLLBACK');
                return res.status(500).send("Erro ao excluir contato");
            }

            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).send("Erro no commit da exclusão");
                }
                res.redirect('/contatos?success=excluido');
            });
        });
    });
});

export default router;
