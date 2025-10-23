// ===================================================================
// SCRIPT PARA CONFIGURAR O WEBHOOK (RODAR 1 VEZ LOCALMENTE)
// ===================================================================
// Arquivo: configurarWebhook.js
// ===================================================================

import 'dotenv/config'; // Carrega variáveis de .env
import https from 'https';
import axios from 'axios';
import { getEfiToken } from './efiAuth.js'; // Importa a função de auth

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_PIX_KEY, // Sua chave PIX
    EFI_SANDBOX, // 'true' para testes, 'false' para produção
    WEBHOOK_URL // A URL do seu backend no Render
} = process.env;

const EFI_ENV = EFI_SANDBOX === 'true' ? 'sandbox' : 'producao';
const EFI_BASE_URL = `https://api-pix.${EFI_ENV}.eﬁ.com.br`;

// Agente para as chamadas de API
const apiAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Função principal para configurar o Webhook
 */
async function configurarWebhook() {
    console.log('Iniciando configuração do Webhook na Efí...');

    if (!EFI_PIX_KEY || !WEBHOOK_URL) {
        console.error('ERRO: As variáveis EFI_PIX_KEY e WEBHOOK_URL precisam estar no seu arquivo .env');
        return;
    }

    try {
        const token = await getEfiToken();

        // A URL do webhook DEVE ter o sufixo "?ignorar="
        // A Efí adiciona "/pix" ao final, e isso faz com que a query string seja ignorada.
        const urlParaRegistrar = `${WEBHOOK_URL}?ignorar=`;

        const payload = {
            webhookUrl: urlParaRegistrar
        };

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            // IMPORTANTE: Isso desabilita a verificação mTLS,
            // que é necessária para o plano gratuito do Render.
            'x-skip-mtls-checking': 'true'
        };
        
        // A chave pix vai na URL da chamada PUT
        const urlApi = `${EFI_BASE_URL}/v2/webhook/${encodeURIComponent(EFI_PIX_KEY)}`;

        console.log(`Enviando configuração para a chave ${EFI_PIX_KEY}...`);
        console.log(`URL a ser registrada: ${urlParaRegistrar}`);

        await axios({
            method: 'PUT',
            url: urlApi,
            https: apiAgent,
            headers: headers,
            data: payload
        });

        console.log('\n✅ SUCESSO! Webhook configurado com sucesso na Efí.');
        console.log('Seu backend agora está pronto para receber notificações de pagamento.');

    } catch (error) {
        console.error('\n❌ ERRO AO CONFIGURAR O WEBHOOK:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        // Mensagem de ajuda corrigida (webhook.write)
        console.log('\nVerifique se suas credenciais (CLIENT_ID, CLIENT_SECRET, EFI_PIX_KEY) estão corretas no arquivo .env e se o escopo "Alterar Webhooks" (webhook.write) está ativo na sua Aplicação Efí.');
    }
}

// Executa a função
configurarWebhook();

