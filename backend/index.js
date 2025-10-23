// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js
// ===================================================================

import 'dotenv/config'; // Carrega variáveis de .env
import express from 'express';
import cors from 'cors';
import https from 'https';
import axios from 'axios';
import crypto from 'crypto';

// --- Configuração das Variáveis de Ambiente ---
// Você DEVE configurar estas variáveis no Render
const {
    EFI_CLIENT_ID,
    EFI_CLIENT_SECRET,
    EFI_PIX_KEY, // Sua chave PIX (CPF, CNPJ, e-mail, etc.) cadastrada na Efí
    EFI_SANDBOX // 'true' para testes, 'false' para produção
} = process.env;

const EFI_ENV = EFI_SANDBOX === 'true' ? 'sandbox' : 'producao';
const EFI_BASE_URL = `https://api-pix.${EFI_ENV}.eﬁ.com.br`;

// Validação de configuração
if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET || !EFI_PIX_KEY) {
    console.error('ERRO: Variáveis de ambiente da Efí (CLIENT_ID, CLIENT_SECRET, PIX_KEY) não estão definidas!');
    process.exit(1);
}

// --- Autenticação Efí (OAuth2) ---
// Agente para autenticação (Basic Auth)
const authAgent = new https.Agent({
    rejectUnauthorized: false // Necessário para os certificados da Efí em alguns ambientes
});

// Cache do token de acesso
let efiAccessToken = null;
let tokenExpires = 0;

/**
 * Obtém um token de acesso da Efí, usando cache.
 */
async function getEfiToken() {
    // Se o token existe e ainda é válido (com 60s de margem)
    if (efiAccessToken && Date.now() < tokenExpires - 60000) {
        return efiAccessToken;
    }

    console.log('Gerando novo token de acesso Efí...');
    const credentials = Buffer.from(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios({
            method: 'POST',
            url: `${EFI_BASE_URL}/oauth/token`,
            https://: authAgent,
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            data: {
                grant_type: 'client_credentials'
            }
        });

        efiAccessToken = response.data.access_token;
        // Define a expiração (em milissegundos)
        tokenExpires = Date.now() + (response.data.expires_in * 1000);
        console.log('Token Efí gerado com sucesso.');
        return efiAccessToken;

    } catch (error) {
        console.error('Erro ao obter token da Efí:', error.response?.data || error.message);
        throw new Error('Falha na autenticação com a Efí.');
    }
}

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
        const token = await getEfiToken();

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
            https: authAgent,
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
            https: authAgent,
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
// IMPORTANTE: Configure esta URL no seu dashboard da Efí
// URL: https://seu-site.onrender.com/webhook
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
