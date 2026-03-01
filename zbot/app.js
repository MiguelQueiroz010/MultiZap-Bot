import createError from 'http-errors';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import http from 'http';
import { Server } from 'socket.io';
import * as wppconnect from '@wppconnect-team/wppconnect';

import contatosRouter from './routes/contatos.js';
import campanhasRouter from './routes/campanhas.js';
import fluxosRouter from './routes/fluxos.js';
import filasRouter from './routes/filas.js';
import bibliotecaRouter from './routes/biblioteca.js';
import { iniciarAgendador } from './workers/agendador.js';

// Configuração para emular o __dirname no ES6
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Instancia o Socket.io

const port = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Lógica do WPPConnect ---
let clientInstance = null;
let currentStatus = 'Iniciando...';

function iniciarWPP() {
    currentStatus = 'Iniciando...';
    io.emit('status', currentStatus);

    console.log("⏳ Iniciando WPPConnect.create...");
    wppconnect.create({
        session: 'admin-session',
        disableWelcome: true, // Pula mensagem de boas vindas
        updatesLog: false,     // Desabilita logs de atualização (mais rápido)
        debug: false,
        catchQR: (base64Qrimg) => {
            console.log("📸 QR Code recebido.");
            io.emit('qrCode', base64Qrimg);
            currentStatus = 'Escaneie o QR Code';
            io.emit('status', currentStatus);
        },
        statusFind: (statusSession, session) => {
            console.log('📡 Status da Sessão:', statusSession);
            currentStatus = statusSession;
            io.emit('status', currentStatus);
        },
        autoClose: 0,
        protocolTimeout: 90000, // Aumenta timeout para 90s para conexões lentas
        puppeteerOptions: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',                // Melhora performance em servidores
                '--disable-dev-shm-usage',      // Evita problemas de memória compartilhada
                '--hide-scrollbars'
            ]
        }
    })
        .then((client) => {
            clientInstance = client;
            console.log('✅ Cliente conectado com sucesso!');
            currentStatus = 'CONNECTED';
            io.emit('status', currentStatus);

            iniciarAgendador(client);

            client.onMessage((message) => {
                if (message.body === 'Oi') {
                    client.sendText(message.from, 'Olá! Sou um bot em ES6.');
                }
            });
        })
        .catch((err) => {
            console.error(err);
            currentStatus = 'Erro na conexão';
            io.emit('status', currentStatus);
        });
}

// Inicia a conexão pela primeira vez
iniciarWPP();

// Garante que novos clientes que conectarem ao socket recebam o status atual
io.on('connection', (socket) => {
    console.log('Novo cliente no painel:', socket.id);
    socket.emit('status', currentStatus); // Envia o estado atual para quem acabou de chegar
});

// --- Rotas ---
app.get('/', (req, res) => {
    res.render('index', { title: 'ZBot - Painel' });
});

// Rota de Logout (Reset de Sessão)
app.post('/logout', async (req, res) => {
    console.log('🔄 Solicitando logout e reset de sessão...');

    // Feedback imediato para o painel
    currentStatus = 'Iniciando...';
    io.emit('status', currentStatus);
    io.emit('qrCode', null); // Limpa QR anterior

    try {
        if (clientInstance) {
            console.log('🔌 Fechando instância do cliente...');
            // Tenta dar logout e fechar
            await Promise.race([
                clientInstance.logout().catch(() => { }),
                new Promise(resolve => setTimeout(resolve, 5000)) // Timeout de 5s para fechar
            ]);
            await clientInstance.close().catch(() => { });
            clientInstance = null;
        }
    } catch (e) {
        console.error('Erro ao fechar cliente:', e);
    }

    // Aguarda 3 segundos para o SO liberar os arquivos (essencial no Windows)
    setTimeout(() => {
        const sessionPath = path.join(__dirname, 'tokens', 'admin-session');
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('✅ Pasta de sessão apagada.');
            } catch (err) {
                console.error('⚠️ Não foi possível apagar a pasta de sessão (está em uso?):', err.message);
            }
        }

        // Reinicia o processo
        iniciarWPP();
        res.redirect('/');
    }, 3000);
});

app.use('/contatos', contatosRouter);
app.use('/campanhas', campanhasRouter);
app.use('/fluxos', fluxosRouter);
app.use('/filas', filasRouter);
app.use('/biblioteca', bibliotecaRouter);

// Tratamento de erros
app.use((req, res, next) => next(createError(404)));
app.use((err, req, res, next) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

// Inicialização
server.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});