// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO PRODUÇÃO-ONLY - LIMPA)
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
    // SETUP_SECRET não é mais necessário
} = process.env;

// URL de OPERAÇÕES PIX de PRODUÇÃO da Efí.
const EFI_PIX_URL = `https://api.efipay.com.br`;

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
            calendario: { expiracao: 300 }, // 5 minutos
            valor: { original: "1.00" },
            chave: EFI_PIX_KEY,
            solicitacaoPagador: "Download Anúncio de Veículo"
        };
        
        const cobResponse = await axios({
            method: 'POST',
            url: `${EFI_PIX_URL}/v2/cob`, // Usa a URL do PIX
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
            url: `${EFI_PIX_URL}/v2/loc/${locId}/qrcode`, // Usa a URL do PIX
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


// --- Iniciar o Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
    console.log(`Modo Efí: producao`);
    console.log(`URL Base da API PIX: ${EFI_PIX_URL}`); // URL de PIX
});

