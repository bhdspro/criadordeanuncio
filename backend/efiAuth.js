// ===================================================================
// LÓGICA DE AUTENTICAÇÃO DA EFÍ
// ===================================================================
// Arquivo: efiAuth.js (VERSÃO PRODUÇÃO-ONLY)
// ===================================================================

import https from 'https';
import axios from 'axios';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_CLIENT_ID,
    EFI_CLIENT_SECRET
    // EFI_SANDBOX não é mais necessário
} = process.env;

// URL de PRODUÇÃO da Efí.
const EFI_BASE_URL = `https://api-pix.efipay.com.br`;

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
// ... (O restante do arquivo continua igual ao que você tem) ...
// ... (catch (error) ...) ...

