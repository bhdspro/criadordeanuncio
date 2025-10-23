// ===================================================================
// LÓGICA DE AUTENTICAÇÃO DA EFÍ
// ===================================================================
// Arquivo: efiAuth.js
// ===================================================================

import https from 'https';
import axios from 'axios';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_CLIENT_ID,
    EFI_CLIENT_SECRET,
    EFI_SANDBOX
} = process.env;

// CORREÇÃO LÓGICA DA URL:
// Sandbox usa '.sandbox.', Produção não usa nada.
const EFI_ENV_SUBDOMAIN = EFI_SANDBOX === 'true' ? 'sandbox.' : '';
const EFI_BASE_URL = `https://api-pix.${EFI_ENV_SUBDOMAIN}efipay.com.br`;

// Agente para autenticação (Basic Auth)
const authAgent = new https.Agent({
    rejectUnauthorized: false
});

// Cache do token de acesso
let efiAccessToken = null;
let tokenExpires = 0;

/**
 * Obtém um token de acesso da Efí, usando cache.
 */
export async function getEfiToken() {
    if (efiAccessToken && Date.now() < tokenExpires - 60000) {
        return efiAccessToken;
    }

    if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET) {
        console.error('ERRO: Variáveis de ambiente da Efí (CLIENT_ID, CLIENT_SECRET) não estão definidas!');
        throw new Error('Credenciais da Efí não encontradas.');
    }

    console.log(`Gerando novo token de acesso Efí para: ${EFI_BASE_URL}`);
    const credentials = Buffer.from(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios({
            method: 'POST',
            url: `${EFI_BASE_URL}/oauth/token`,
            https: authAgent,
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            data: {
                grant_type: 'client_credentials'
            }
        });

        efiAccessToken = response.data.access_token;
        tokenExpires = Date.now() + (response.data.expires_in * 1000);
        console.log('Token Efí gerado com sucesso.');
        return efiAccessToken;

    } catch (error) {
        console.error('Erro ao obter token da Efí:', error.response?.data || error.message);
        throw new Error('Falha na autenticação com a Efí.');
    }
}

