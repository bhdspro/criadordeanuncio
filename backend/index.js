// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO PRODUÇÃO-ONLY - LIMPA - DIAGNÓSTICO AVANÇADO 2)
// ===================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import https from 'https';
import axios from 'axios';
import { getEfiToken } from './efiAuth.js';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY
} = process.env;

// URL de OPERAÇÕES PIX de PRODUÇÃO da Efí.
const EFI_PIX_URL = `https://api.efipay.com.br`;
console.log(`URL Base da API PIX: ${EFI_PIX_URL}`);

// Validação de configuração
if (!EFI_PIX_KEY) {
    console.error('ERRO: Variável de ambiente EFI_PIX_KEY não está definida!');
    process.exit(1);
}

// Agente para as chamadas de API (Necessário para certificados da Efí)
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
    const createChargeUrl = `${EFI_PIX_URL}/v2/cob`;
    try {
        const token = await getEfiToken();

        const cobPayload = {
            calendario: { expiracao: 300 }, // 5 minutos
            valor: { original: "1.00" },
            chave: EFI_PIX_KEY
        };

        console.log(`Enviando payload para Efí (${createChargeUrl}):`, JSON.stringify(cobPayload));

        const cobResponse = await axios({
            method: 'POST',
            url: createChargeUrl,
            httpsAgent: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Adicionado: Indica que esperamos JSON
            },
            data: cobPayload
        });

        const cobData = cobResponse.data;

        // Verifica se a resposta é um objeto JSON esperado e contém loc.id
        if (typeof cobData !== 'object' || cobData === null || !cobData.loc || !cobData.loc.id) {
             console.error('Erro em /create-charge: Resposta da Efí não contém loc.id esperado.');
             // Aumentado o tamanho do preview da resposta
             const responsePreview = typeof cobData === 'string' ? cobData.substring(0, 2000) + '...' : JSON.stringify(cobData, null, 2);
             console.error('Preview da Resposta recebida:', responsePreview);
             // Loga também os cabeçalhos da resposta, pode dar pistas
             if (cobResponse && cobResponse.headers) {
                console.error('Cabeçalhos da Resposta Recebida:', JSON.stringify(cobResponse.headers, null, 2));
             }
             throw new Error('Resposta inválida da API Efí ao criar cobrança.');
        }

        const { txid, loc } = cobData;
        const locId = loc.id;
        console.log(`Cobrança criada, TXID: ${txid}, LOC ID: ${locId}`);

        // Buscar QR Code
        const qrUrl = `${EFI_PIX_URL}/v2/loc/${locId}/qrcode`;
        console.log(`Buscando QR Code em: ${qrUrl}`);
        const qrResponse = await axios({
            method: 'GET',
            url: qrUrl,
            httpsAgent: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json' // Adicionado aqui também por consistência
            }
        });

        // Verifica se a resposta do QR Code é válida
        const qrData = qrResponse.data;
        if (typeof qrData !== 'object' || qrData === null || !qrData.qrcode || !qrData.imagemQrcode) {
             console.error('Erro em /create-charge: Resposta da Efí ao buscar QR Code inválida.');
             console.error('Preview da Resposta QR Code:', JSON.stringify(qrData, null, 2));
             throw new Error('Resposta inválida da API Efí ao buscar QR Code.');
        }

        paymentStatus.set(txid, 'PENDING');

        res.json({
            txid: txid,
            pixCopiaECola: qrData.qrcode,
            imagemQrcode: qrData.imagemQrcode,
        });

    } catch (error) {
        console.error('Erro detalhado em /create-charge:');
        if (error.response) {
            console.error('Status:', error.response.status);
            // Aumentado o tamanho do preview da resposta de erro
             const responseDataPreview = typeof error.response.data === 'string'
                ? error.response.data.substring(0, 2000) + '...'
                : JSON.stringify(error.response.data, null, 2);
            console.error('Data:', responseDataPreview);
            console.error('Cabeçalhos da Resposta de Erro:', JSON.stringify(error.response.headers, null, 2)); // Loga cabeçalhos do erro
            console.error('URL da requisição com erro:', error.config?.url);
        } else if (error.request) {
            console.error('Nenhuma resposta recebida da Efí.');
            console.error('URL da requisição sem resposta:', error.config?.url);
        } else {
            console.error('Erro ao configurar request:', error.message);
        }
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
    console.log(`URL Base da API PIX: ${EFI_PIX_URL}`);
});

