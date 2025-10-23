// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO COMPLETA E CORRIGIDA)
// ===================================================================

import 'dotenv/config'; // Carrega variáveis de .env
import express from 'express';
import cors from 'cors';
import https from 'https';
import axios from 'axios';
import { getEfiToken } from './efiAuth.js'; // Importa a função de auth

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY, // Sua chave PIX (CPF, CNPJ, e-mail, etc.) cadastrada na Efí
    EFI_SANDBOX // 'true' para testes, 'false' para produção
} = process.env;

const EFI_ENV = EFI_SANDBOX === 'true' ? 'sandbox' : 'producao';
// CORREÇÃO: Domínio correto 'efi.com.br'
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


// --- Armazenamento Simples de Pagamentos ---
// Em produção, use um banco de dados (Redis, Firestore, etc.)
// Aqui, usamos um Map em memória (só funciona se o Render não dormir)
const paymentStatus = new Map();

// --- Configuração do Servidor Express ---
const app = express();
app.use(cors()); // Permite requisições do seu frontend
app.use(express.json()); // Habilita o parsing de JSON no body

// --- Endpoint 1: Criar Cobrança PIX ---
app.post('/create-charge', async (req, res) => {
    console.log('Recebida requisição para /create-charge');
    try {
        const token = await getEfiToken(); // Usa a função importada

        // 1. Criar a cobrança (COB)
        const cobPayload = {
            calendario: {
                expiracao: 300 // 5 minutos (300 segundos)
            },
            valor: {
                original: "1.00" // O valor da cobrança
            },
            chave: EFI_PIX_KEY, // Sua chave PIX
            solicitacaoPagador: "Download Anúncio de Veículo"
        };
        
        // Usamos POST para que a Efí gere o TXID
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

        // 2. Obter o QR Code
        const qrResponse = await axios({
            method: 'GET',
            url: `${EFI_BASE_URL}/v2/loc/${locId}/qrcode`,
            https: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const qrData = qrResponse.data;

        // Armazena o status do pagamento
        paymentStatus.set(txid, 'PENDING');

        // Retorna os dados para o frontend
        res.json({
            txid: txid,
            pixCopiaECola: qrData.qrcode, // Este é o "Copia e Cola"
            imagemQrcode: qrData.imagemQrcode, // Este é o Data URL da imagem
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
        paymentStatus.delete(txid); // Limpa o status após a confirmação
    }

    res.json({ status });
});

// --- Endpoint 3: Webhook da Efí ---
// ESTA É A URL QUE VAMOS REGISTRAR COM O SCRIPT
app.post('/webhook', (req, res) => {
    console.log('Webhook da Efí recebido!');
    
    // A Efí envia um array de notificações
    const notifications = req.body?.pix;

    if (!notifications || !Array.isArray(notifications)) {
        console.warn('Webhook recebido, mas sem dados "pix" válidos.');
        return res.status(400).send('Formato inválido.');
    }

    for (const pix of notifications) {
        const txid = pix.txid;
        if (txid) {
            console.log(`Webhook: Pagamento recebido para o TXID: ${txid}`);
            // Atualiza o status no nosso "banco" em memória
            paymentStatus.set(txid, 'PAID');
        }
    }

    // Responde 200 OK IMEDIATAMENTE para a Efí
    res.status(200).send('OK');
});

// --- Iniciar o Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
    console.log(`Webhook URL esperada: /webhook`);
    console.log(`Modo Efí: ${EFI_ENV}`);
});

