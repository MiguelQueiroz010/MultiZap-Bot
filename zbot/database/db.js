import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'bot.db');

export const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados SQLite', err.message);
    } else {
        console.log('✅ Conectado ao banco de dados SQLite.');
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        // Tabela de Contatos
        db.run(`
            CREATE TABLE IF NOT EXISTS contatos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL UNIQUE
            )
        `);

        // Tabela de Campanhas (disparo simples)
        db.run(`
            CREATE TABLE IF NOT EXISTS campanhas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mensagem TEXT NOT NULL,
                delay_min INTEGER NOT NULL,
                delay_max INTEGER NOT NULL
            )
        `);

        // Tabela de Fila de Envio (para campanhas e fluxos)
        db.run(`
            CREATE TABLE IF NOT EXISTS fila_envio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contato_id INTEGER,
                telefone TEXT NOT NULL,
                mensagem TEXT NOT NULL,
                agendado_para DATETIME NOT NULL,
                status TEXT DEFAULT 'PENDENTE',
                FOREIGN KEY (contato_id) REFERENCES contatos(id)
            )
        `);

        // Tabela de Fluxos (sequências de mensagens)
        db.run(`
            CREATE TABLE IF NOT EXISTS fluxos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            )
        `);

        // Tabela de Etapas do Fluxo
        db.run(`
            CREATE TABLE IF NOT EXISTS fluxo_etapas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fluxo_id INTEGER NOT NULL,
                mensagem TEXT NOT NULL,
                delay_minutos INTEGER NOT NULL,
                ordem INTEGER NOT NULL,
                FOREIGN KEY (fluxo_id) REFERENCES fluxos(id)
            )
        `);

        // Tabela de Execução de Fluxo (acompanha em que etapa do fluxo o contato está)
        db.run(`
            CREATE TABLE IF NOT EXISTS execucao_fluxo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fluxo_id INTEGER NOT NULL,
                contato_id INTEGER NOT NULL,
                etapa_atual INTEGER NOT NULL DEFAULT 1,
                proxima_execucao DATETIME NOT NULL,
                status TEXT DEFAULT 'ATIVO',
                FOREIGN KEY (fluxo_id) REFERENCES fluxos(id),
                FOREIGN KEY (contato_id) REFERENCES contatos(id)
            )
        `);
        
        console.log('✅ Tabelas criadas/verificadas com sucesso.');
    });
}
