// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO PRODUÇÃO-ONLY + CONFIGURADOR)
// ===================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import https from 'https';
import axios from 'axios';
import { getEfiToken } from './efiAuth.js';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY,
    // EFI_SANDBOX não é mais necessário
    SETUP_SECRET
} = process.env;

// URL de PRODUÇÃO da Efí.
const EFI_BASE_URL = `https://api-pix.efipay.com.br`;

// Validação de configuração
if (!EFI_PIX_KEY) {
    console.error('ERRO: Variável de ambiente EFI_PIX_KEY não está definida!');
    process.exit(1);
}

// Agente para as chamadas de API
const apiAgent = new https.Agent({
    rejectUnauthorized: false
});

// Armazenamento Simples de Pagamentos
const paymentStatus = new Map();

// --- Configuração do Servidor Express ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Endpoint 1: Criar Cobrança PIX ---
app.post('/create-charge', async (req, res) => {
    console.log('Recebida requisição para /create-charge');
    try {
        const token = await getEfiToken();

        const cobPayload = {
            calendario: { expiracao: 300 },
            valor: { original: "1.00" },
            chave: EFI_PIX_KEY,
            solicitacaoPagador: "Download Anúncio de Veículo"
        };
        
        const cobResponse = await axios({
// ... (O restante do arquivo continua igual ao que você tem) ...
// ... (app.get('/check-payment/:txid', ...)) ...
// ... (app.post('/webhook', ...)) ...
// ... (app.get('/configure-webhook/:secret', ...)) ...
// ... (app.listen(PORT, ...)) ...

