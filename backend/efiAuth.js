// ===================================================================
// LÓGICA DE AUTENTICAÇÃO DA EFÍ (COM CERTIFICADO)
// ===================================================================
// Arquivo: efiAuth.js
// ===================================================================

import https from 'https';
import axios from 'axios';
import fs from 'fs'; // Módulo para ler arquivos

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_CLIENT_ID,
    EFI_CLIENT_SECRET,
    EFI_CERT_PATH,        // Caminho para o certificado .pem público
    EFI_KEY_PATH,         // Caminho para a chave .pem privada
    EFI_CERT_PASSPHRASE   // Senha da chave .pem (se houver)
} = process.env;

// URL de AUTENTICAÇÃO de PRODUÇÃO da Efí.
const EFI_AUTH_URL = `https://api.efipay.com.br`;
console.log(`URL Base da API Auth: ${EFI_AUTH_URL}`);


// Validação de configuração
if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET) {
    console.error('ERRO: Variáveis de ambiente da Efí (CLIENT_ID, CLIENT_SECRET) não estão definidas!');
    throw new Error('Credenciais da Efí não encontradas.');
}
// Valida se os caminhos dos certificados foram definidos
if (!EFI_CERT_PATH || !EFI_KEY_PATH) {
     console.warn('AVISO: Caminhos dos certificados Efí (EFI_CERT_PATH, EFI_KEY_PATH) não definidos. Tentando sem mTLS.');
}

// Carrega os certificados (se os caminhos foram fornecidos)
let certOptions = {};
try {
    if (EFI_CERT_PATH && EFI_KEY_PATH && fs.existsSync(EFI_CERT_PATH) && fs.existsSync(EFI_KEY_PATH)) {
        certOptions = {
            cert: fs.readFileSync(EFI_CERT_PATH),
            key: fs.readFileSync(EFI_KEY_PATH),
            passphrase: EFI_CERT_PASSPHRASE // Será undefined se não estiver no .env
        };
         console.log('Certificados Efí carregados com sucesso.');
    } else if (EFI_CERT_PATH || EFI_KEY_PATH) {
         console.error(`ERRO: Um ou ambos os arquivos de certificado não foram encontrados nos caminhos: CERT='${EFI_CERT_PATH}', KEY='${EFI_KEY_PATH}'`);
         // Considerar lançar um erro aqui dependendo da sua política
    }
} catch (err) {
    console.error('ERRO ao carregar os certificados Efí:', err.message);
    // Considerar lançar um erro aqui
}


// Agente para autenticação (Basic Auth + Certificados)
const authAgent = new https.Agent({
    ...certOptions, // Adiciona os certificados lidos
    rejectUnauthorized: false // Mantido, pode ser necessário dependendo da cadeia de certificados da Efí
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

    console.log(`Gerando novo token de acesso Efí para: ${EFI_AUTH_URL}`);
    const credentials = Buffer.from(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios({
            method: 'POST',
            url: `${EFI_AUTH_URL}/oauth/token`,
            httpsAgent: authAgent, // Usa o agente configurado com certificados
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Boa prática
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
        console.error('Erro ao obter token da Efí:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Mensagem:', error.message);
        }
        throw new Error('Falha na autenticação com a Efí. Verifique as credenciais e certificados no Render.');
    }
}

// Exporta o agente configurado para ser usado em outras chamadas API
export const apiAgentWithCerts = new https.Agent({
    ...certOptions,
    rejectUnauthorized: false
});

