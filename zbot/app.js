import createError from 'http-errors';
import express from 'express';
import path from 'path';
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
wppconnect.create({
    session: 'admin-session',
    catchQR: (base64Qrimg) => {
        // Envia o QR Code para o front-end
        io.emit('qrCode', base64Qrimg);
        io.emit('status', 'Escaneie o QR Code');
    },
    statusFind: (statusSession, session) => {
        console.log('Status da Sessão:', statusSession);
        // Envia o status atual (isLogged, notLogged, browserClosed, etc)
        io.emit('status', statusSession);
    },
    // Opcional: impede que o bot feche se não houver interação
    autoClose: 0,
})
    .then((client) => {
        // IMPORTANTE: Quando o 'then' é executado, a conexão foi estabelecida
        console.log('✅ Cliente conectado com sucesso!');
        io.emit('status', 'CONNECTED'); // Isso dispara o sucesso no seu Pug

        // --- INICIA O WORKER BACKGROUND ASSÍNCRONO --
        iniciarAgendador(client);

        client.onMessage((message) => {
            if (message.body === 'Oi') {
                client.sendText(message.from, 'Olá! Sou um bot em ES6.');
            }
        });
    })
    .catch((err) => {
        console.error(err);
        io.emit('status', 'Erro na conexão');
    });

// Garante que novos clientes que conectarem ao socket recebam o status atual
io.on('connection', (socket) => {
    console.log('Novo cliente no painel:', socket.id);
    // Aqui você poderia adicionar uma lógica para checar se o client já está logado
    socket.emit('status', currentStatus); // Envia o estado atual para quem acabou de chegar
});

// --- Rotas ---
app.get('/', (req, res) => {
    res.render('index', { title: 'ZBot - Painel' });
});

app.use('/contatos', contatosRouter);
app.use('/campanhas', campanhasRouter);
app.use('/fluxos', fluxosRouter);
app.use('/filas', filasRouter);

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

let currentStatus = 'Iniciando...';

// Dentro do statusFind e do .then, atualize:
currentStatus = 'CONNECTED';
io.emit('status', currentStatus);

// E no io.on('connection'):
io.on('connection', (socket) => {
    socket.emit('status', currentStatus); // Envia o estado atual para quem acabou de chegar
});