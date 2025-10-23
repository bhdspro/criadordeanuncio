// ===================================================================
// SCRIPT PARA CONFIGURAR O WEBHOOK (RODAR 1 VEZ LOCALMENTE)
// ===================================================================
// Arquivo: configurarWebhook.js
// ===================================================================

import 'dotenv/config'; // Carrega variáveis do .env local
import https from 'https';
import axios from 'axios';
import { getEfiToken } from './efiAuth.js'; // Importa a função de auth

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY, // Chave PIX
    EFI_SANDBOX, // 'true' ou 'false'
    WEBHOOK_URL  // URL completa do seu backend (Ex: https://...onrender.com/webhook)
} = process.env;

const EFI_ENV = EFI_SANDBOX === 'true' ? 'sandbox' : 'producao';
// CORREÇÃO: Domínio correto 'efi.com.br'
const EFI_BASE_URL = `https://api-pix.${EFI_ENV}.efipay.com.br`;

// Agente para as chamadas de API
const apiAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Função principal para configurar o webhook.
 */
async function configurarWebhook() {
    console.log('Iniciando configuração do Webhook na Efí...');

    // Validação
    if (!EFI_PIX_KEY || !WEBHOOK_URL) {
        console.error('❌ ERRO: Verifique se EFI_PIX_KEY e WEBHOOK_URL estão definidos no arquivo .env');
        return;
    }

    try {
        // 1. Obter token de acesso
        const token = await getEfiToken();

        // 2. Definir o payload e a URL
        const payload = {
            webhookUrl: WEBHOOK_URL
        };
        const url = `${EFI_BASE_URL}/v2/webhook/${EFI_PIX_KEY}`;

        console.log(`Registrando Webhook para a chave ${EFI_PIX_KEY}...`);
        console.log(`URL: ${WEBHOOK_URL}`);

        // 3. Fazer a chamada PUT para registrar o webhook
        await axios({
            method: 'PUT',
            url: url,
            httpsAgent: apiAgent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                // IMPORTANTE: Isso pula a verificação mTLS que o Render não suporta
                'x-skip-mtls-checking': 'true' 
            },
            data: payload
        });

        console.log('✅ SUCESSO! Webhook configurado com sucesso na Efí.');
        console.log('O seu backend no Render agora será notificado sobre pagamentos.');

    } catch (error) {
        console.error('\n❌ ERRO AO CONFIGURAR O WEBHOOK:');
        
        if (error.message.includes('Falha na autenticação')) {
            console.error(error.message); // Erro do getEfiToken
        } else if (error.response) {
            // Erros da chamada PUT
            console.error('Status:', error.response.status);
            console.error('Detalhes:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Erro desconhecido:', error.message);
        }

        console.error('\nVerifique se suas credenciais (CLIENT_ID, CLIENT_SECRET, EFI_PIX_KEY) estão corretas no arquivo .env e se o escopo "Alterar Webhooks" (webhook.write) está ativo na sua Aplicação Efí.');
    }
}

// Executa a função
configurarWebhook();

