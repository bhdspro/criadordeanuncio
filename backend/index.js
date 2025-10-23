// ===================================================================
// SERVIDOR BACKEND (PARA DEPLOY NO RENDER)
// ===================================================================
// Arquivo: index.js (VERSÃO PRODUÇÃO-ONLY - COM CERTIFICADOS REFINADOS)
// ===================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
// Importa token e o AGENTE COMUM configurado
import { getEfiToken, apiAgentWithCerts } from './efiAuth.js';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY
} = process.env;

// URL de OPERAÇÕES PIX de PRODUÇÃO da Efí.
const EFI_API_URL = `https://api.efipay.com.br`; // URL única para Auth e PIX em produção
console.log(`URL Base das APIs Efí: ${EFI_API_URL}`);

// Validação de configuração
if (!EFI_PIX_KEY) {
    console.error('ERRO CRÍTICO: Variável de ambiente EFI_PIX_KEY não está definida!');
    process.exit(1); // Sai se a chave PIX estiver faltando
}

// Armazenamento Simples de Pagamentos
const paymentStatus = new Map();

// --- Configuração do Servidor Express ---
const app = express();
// Configura CORS de forma mais explícita (ajuste 'origin' se necessário)
app.use(cors({ origin: '*' })); // Permite de qualquer origem por enquanto
app.use(express.json());

// --- Endpoint 1: Criar Cobrança PIX ---
app.post('/create-charge', async (req, res) => {
    console.log('Recebida requisição para /create-charge');
    const createChargeUrl = `${EFI_API_URL}/v2/cob`; // Endpoint para criar cobrança imediata

    try {
        console.log('Tentando obter token Efí...');
        const token = await getEfiToken();
        console.log('Token obtido com sucesso.');

        // Payload mínimo necessário
        const cobPayload = {
            calendario: { expiracao: 300 }, // 5 minutos
            valor: { original: "1.00" },
            chave: EFI_PIX_KEY
        };

        console.log(`Enviando payload para Efí (${createChargeUrl}):`, JSON.stringify(cobPayload));
        console.log('Usando agente HTTPS com validação mútua (rejectUnauthorized: true).');

        const cobResponse = await axios({
            method: 'POST',
            url: createChargeUrl,
            httpsAgent: apiAgentWithCerts, // Usa o agente comum com certificados e validação
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Explicitamente pede JSON
            },
            data: cobPayload,
            timeout: 10000 // Adiciona timeout de 10 segundos
        });

        const cobData = cobResponse.data;
        const responseHeaders = cobResponse.headers;
        console.log('Cabeçalhos da Resposta (Criação Cob):', JSON.stringify(responseHeaders, null, 2));


        // Verifica se a resposta é JSON e contém os dados esperados
        if (responseHeaders['content-type']?.includes('application/json') && typeof cobData === 'object' && cobData !== null && cobData.loc && cobData.loc.id) {
            const { txid, loc } = cobData;
            const locId = loc.id;
            console.log(`Cobrança criada com sucesso! TXID: ${txid}, LOC ID: ${locId}`);

            // --- Buscar QR Code ---
            const qrUrl = `${EFI_API_URL}/v2/loc/${locId}/qrcode`;
            console.log(`Buscando QR Code em: ${qrUrl}`);
            const qrResponse = await axios({
                method: 'GET',
                url: qrUrl,
                httpsAgent: apiAgentWithCerts, // Usa o mesmo agente
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json' // Pede JSON
                },
                timeout: 10000 // Timeout
            });

            const qrData = qrResponse.data;
            const qrHeaders = qrResponse.headers;
             console.log('Cabeçalhos da Resposta (QR Code):', JSON.stringify(qrHeaders, null, 2));


             if (qrHeaders['content-type']?.includes('application/json') && typeof qrData === 'object' && qrData !== null && qrData.qrcode && qrData.imagemQrcode) {
                console.log('QR Code obtido com sucesso.');
                paymentStatus.set(txid, 'PENDING');

                res.status(200).json({ // Garante status 200
                    txid: txid,
                    pixCopiaECola: qrData.qrcode,
                    imagemQrcode: qrData.imagemQrcode,
                });
            } else {
                 console.error('Erro em /create-charge: Resposta da Efí ao buscar QR Code inválida (não é JSON ou faltam dados).');
                 console.error('Preview da Resposta QR Code:', JSON.stringify(qrData, null, 2));
                 throw new Error('Resposta inválida da API Efí ao buscar QR Code.');
            }
        } else {
            // Se a resposta da criação da cobrança NÃO foi JSON ou faltam dados
             console.error('Erro em /create-charge: Resposta da Efí ao criar cobrança inválida (não é JSON ou faltam dados).');
             const responsePreview = typeof cobData === 'string' ? cobData.substring(0, 1000) + '...' : JSON.stringify(cobData, null, 2);
             console.error('Preview da Resposta recebida:', responsePreview);
             // Logar o HTML especificamente se for o caso
              if (responseHeaders['content-type']?.includes('text/html')) {
                  console.error("ERRO CRÍTICO: Recebido HTML da Efí em vez de JSON. Provável falha na autenticação mTLS ou bloqueio (Cloudflare?).");
              }
             throw new Error('Resposta inválida da API Efí ao criar cobrança.');
        }

    } catch (error) {
        // Log de Erro Mais Detalhado
        console.error('-----------------------------------------------------');
        console.error('ERRO DETALHADO em /create-charge:');
        console.error('-----------------------------------------------------');
        console.error('Timestamp:', new Date().toISOString());
        console.error('URL da Requisição:', error.config?.url);
        console.error('Método:', error.config?.method);

        if (error.response) {
            // O servidor respondeu com um status fora da faixa 2xx
            console.error('Status da Resposta:', error.response.status);
            console.error('Cabeçalhos da Resposta de Erro:', JSON.stringify(error.response.headers, null, 2));
             const responseDataPreview = typeof error.response.data === 'string'
                ? error.response.data.substring(0, 1000) + '...' // Limita o log do HTML
                : JSON.stringify(error.response.data, null, 2);
            console.error('Dados da Resposta de Erro (Preview):', responseDataPreview);
             // Verifica novamente se é HTML
             if (error.response.headers['content-type']?.includes('text/html')) {
                 console.error("--> Confirmação: Resposta foi HTML. Verificar mTLS e possível bloqueio.");
             }

        } else if (error.request) {
            // A requisição foi feita mas nenhuma resposta foi recebida
            console.error('Nenhuma resposta recebida da Efí.');
            // `error.request` é uma instância de XMLHttpRequest no browser e http.ClientRequest no node.js
            // console.error('Detalhes da Requisição:', error.request); // Pode ser muito verboso
        } else {
            // Algo aconteceu ao configurar a requisição que acionou um erro
            console.error('Erro ao configurar a requisição:', error.message);
        }

         // Log sobre certificados
         if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
             console.error('--> Indicação de Erro: Possível problema com certificados (mTLS). Verifique caminhos, senha (se houver), validade e compatibilidade.');
         }

        console.error('-----------------------------------------------------');

        res.status(500).json({ error: 'Não foi possível gerar a cobrança PIX. Verifique os logs do servidor para detalhes.' });
    }
});

// --- Endpoint 2: Verificar Status do Pagamento (Polling) ---
app.get('/check-payment/:txid', (req, res) => {
    const { txid } = req.params;
    const status = paymentStatus.get(txid) || 'NOT_FOUND';
    console.log(`Verificando status para ${txid}: ${status}`); // Log a cada verificação
    if (status === 'PAID') {
        paymentStatus.delete(txid); // Limpa APENAS se já foi pago
    }
    res.json({ status });
});

// --- Endpoint 3: Webhook da Efí ---
app.post('/webhook', (req, res) => {
    console.log('-----------------------------------------------------');
    console.log('Webhook da Efí recebido!');
    console.log('Timestamp:', new Date().toISOString());
    // Log seguro do corpo (evita logar dados sensíveis se houver)
    if (req.body && typeof req.body === 'object') {
         console.log('Corpo do Webhook (parcial):', JSON.stringify(Object.keys(req.body))); // Loga apenas as chaves
    } else {
         console.log('Corpo do Webhook não é um objeto JSON válido ou está vazio.');
    }
    // console.log('Cabeçalhos do Webhook:', JSON.stringify(req.headers, null, 2)); // Pode ser útil para depurar mTLS do webhook

    const notifications = req.body?.pix;

    if (!notifications || !Array.isArray(notifications)) {
        console.warn('Webhook recebido, mas formato inválido (sem array "pix").');
        return res.status(400).send('Formato inválido.'); // Retorna erro claro
    }

    let paymentProcessed = false;
    for (const pix of notifications) {
        const txid = pix.txid;
        const status = pix.status; // Efí pode enviar status diferente de CONCLUIDA
        const valor = pix.valor;

        if (txid) {
            console.log(`Webhook: Notificação para TXID: ${txid}, Status: ${status}, Valor: ${valor}`);
            // Idealmente, você verificaria o status e o valor aqui antes de marcar como pago
            // Ex: if (status === 'CONCLUIDA') { ... }
            paymentStatus.set(txid, 'PAID'); // Marca como pago se receber notificação com txid
            paymentProcessed = true;
        } else {
             console.warn('Webhook: Notificação PIX recebida sem TXID.');
        }
    }

     if (paymentProcessed) {
         console.log('Webhook processado com sucesso.');
     } else {
         console.log('Webhook recebido, mas nenhuma notificação PIX com TXID encontrada para processar.');
     }
    console.log('-----------------------------------------------------');

    res.status(200).send('OK'); // Responde OK para a Efí
});

// --- Iniciar o Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
    console.log(`Modo Efí: producao`);
    console.log(`URL Base das APIs Efí: ${EFI_API_URL}`);
});

