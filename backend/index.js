// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO COMPLETA + CONFIGURADOR DE WEBHOOK)
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
    EFI_SANDBOX,
    SETUP_SECRET // Nova variável para o setup
} = process.env;

const EFI_ENV = EFI_SANDBOX === 'true' ? 'sandbox' : 'producao';
const EFI_BASE_URL = `https://api-pix.${EFI_ENV}.efi.com.br`;

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
            method: 'POST',
            url: `${EFI_BASE_URL}/v2/cob`,
            https: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: cobPayload
        });

        const cobData = cobResponse.data;
        const { txid, loc } = cobData;
        const locId = loc.id;
        console.log(`Cobrança criada, TXID: ${txid}, LOC ID: ${locId}`);

        const qrResponse = await axios({
            method: 'GET',
            url: `${EFI_BASE_URL}/v2/loc/${locId}/qrcode`,
            https: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const qrData = qrResponse.data;
        paymentStatus.set(txid, 'PENDING');

        res.json({
            txid: txid,
            pixCopiaECola: qrData.qrcode,
            imagemQrcode: qrData.imagemQrcode,
        });

    } catch (error) {
        console.error('Erro em /create-charge:', error.response?.data || error.message);
        res.status(500).json({ error: 'Não foi possível gerar a cobrança PIX.' });
    }
});

// --- Endpoint 2: Verificar Status do Pagamento (Polling) ---
app.get('/check-payment/:txid', (req, res) => {
    const { txid } = req.params;
    const status = paymentStatus.get(txid) || 'NOT_FOUND';

    if (status === 'PAID') {
        console.log(`Status /check-payment/${txid}: PAID`);
        paymentStatus.delete(txid);
    }
    res.json({ status });
});

// --- Endpoint 3: Webhook da Efí ---
app.post('/webhook', (req, res) => {
    console.log('Webhook da Efí recebido!');
    const notifications = req.body?.pix;

    if (!notifications || !Array.isArray(notifications)) {
        console.warn('Webhook recebido, mas sem dados "pix" válidos.');
        return res.status(400).send('Formato inválido.');
    }

    for (const pix of notifications) {
        const txid = pix.txid;
        if (txid) {
            console.log(`Webhook: Pagamento recebido para o TXID: ${txid}`);
            paymentStatus.set(txid, 'PAID');
        }
    }
    res.status(200).send('OK');
});

// ===================================================================
// !! NOVO ENDPOINT DE CONFIGURAÇÃO !!
// ===================================================================
app.get('/configure-webhook/:secret', async (req, res) => {
    const { secret } = req.params;

    // 1. Validar a senha
    if (!SETUP_SECRET || secret !== SETUP_SECRET) {
        console.warn('Tentativa de configurar o webhook com senha errada!');
        return res.status(401).send('Acesso não autorizado.');
    }

    console.log('Iniciando configuração do Webhook via endpoint secreto...');
    const WEBHOOK_URL_COMPLETA = `https://criadordeanuncio.onrender.com/webhook`;

    try {
        // 2. Obter token (a mesma lógica do script)
        const token = await getEfiToken();

        // 3. Definir o payload e a URL
        const payload = {
            webhookUrl: WEBHOOK_URL_COMPLETA
        };
        const url = `${EFI_BASE_URL}/v2/webhook/${EFI_PIX_KEY}`;

        console.log(`Registrando Webhook para a chave ${EFI_PIX_KEY}...`);
        console.log(`URL: ${WEBHOOK_URL_COMPLETA}`);

        // 4. Fazer a chamada PUT para registrar o webhook
        await axios({
            method: 'PUT',
            url: url,
            httpsAgent: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'x-skip-mtls-checking': 'true' // Pula o mTLS
            },
            data: payload
        });

        const successMessage = '✅ SUCESSO! Webhook configurado com sucesso na Efí.';
        console.log(successMessage);
        res.status(200).send(successMessage);

    } catch (error) {
        console.error('\n❌ ERRO AO CONFIGURAR O WEBHOOK:');
        const errorMessage = error.response?.data || error.message || 'Erro desconhecido';
        console.error(errorMessage);
        res.status(500).json({ error: 'Falha ao configurar o webhook.', details: errorMessage });
    }
});


// --- Iniciar o Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
    console.log(`Modo Efí: ${EFI_ENV}`);
});

