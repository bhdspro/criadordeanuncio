// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO PRODUÇÃO-ONLY - LIMPA - COM MELHOR LOG)
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
console.log(`URL Base da API PIX: ${EFI_PIX_URL}`); // Adiciona log para confirmar URL

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

        console.log('Enviando payload para Efí /v2/cob:', JSON.stringify(cobPayload)); // Log do payload enviado

        const cobResponse = await axios({
            method: 'POST',
            url: `${EFI_PIX_URL}/v2/cob`,
            https: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: cobPayload
        });

        const cobData = cobResponse.data;

        // VERIFICAÇÃO ADICIONADA: Checa se 'loc' existe antes de usá-lo
        if (!cobData || !cobData.loc || !cobData.loc.id) {
            console.error('Erro em /create-charge: Resposta da Efí não contém loc.id esperado.');
            console.error('Resposta recebida:', JSON.stringify(cobData, null, 2));
            throw new Error('Resposta inválida da API Efí ao criar cobrança.');
        }

        const { txid, loc } = cobData;
        const locId = loc.id;
        console.log(`Cobrança criada, TXID: ${txid}, LOC ID: ${locId}`);

        const qrResponse = await axios({
            method: 'GET',
            url: `${EFI_PIX_URL}/v2/loc/${locId}/qrcode`,
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
        // LOG MELHORADO: Imprime detalhes do erro da Efí se disponíveis
        console.error('Erro detalhado em /create-charge:');
        if (error.response) {
            // O request foi feito e o servidor respondeu com status code fora do range 2xx
            console.error('Status:', error.response.status);
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Data:', JSON.stringify(error.response.data, null, 2)); // <-- A RESPOSTA DA EFÍ ESTARÁ AQUI!
        } else if (error.request) {
            // O request foi feito mas nenhuma resposta foi recebida
            console.error('Request:', error.request);
            console.error('Nenhuma resposta recebida da Efí.');
        } else {
            // Algo aconteceu ao configurar o request que acionou um erro
            console.error('Erro ao configurar request:', error.message);
        }
        console.error('Erro original:', error.message); // Mantém o log original

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

