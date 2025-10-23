// ===================================================================
// LÓGICA DE AUTENTICAÇÃO DA EFÍ (REFINAMENTO AVANÇADO mTLS)
// ===================================================================
// Arquivo: efiAuth.js
// ===================================================================

import https from 'https';
import axios from 'axios';
import fs from 'fs';

// --- Configuração das Variáveis de Ambiente ---
const {
    EFI_CLIENT_ID,
    EFI_CLIENT_SECRET,
    EFI_CERT_PATH,
    EFI_KEY_PATH,
    EFI_CERT_PASSPHRASE
} = process.env;

// URL de AUTENTICAÇÃO e PIX de PRODUÇÃO da Efí.
const EFI_API_URL = `https://api.efipay.com.br`;
console.log(`URL Base das APIs Efí: ${EFI_API_URL}`);

// --- Certificado CA Raiz da Efí (Obtido de fontes confiáveis) ---
// Incluir o CA pode ajudar na validação do certificado do servidor da Efí,
// especialmente em ambientes restritos ou se houver problemas de cadeia.
// Este é um CA comum usado por muitas entidades, incluindo a Efí via DigiCert.
const EFI_CA_CERT = `-----BEGIN CERTIFICATE-----
MIIDrzCCApegAwIBAgIQCDvgVpBCRrGhdWrJWZHHSjANBgkqhkiG9w0BAQUFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBD
QTAeFw0wNjExMTAwMDAwMDBaFw0zMTExMTAwMDAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IENBMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4jvhEXLeqKTTo1eqUKKPC3eQyaKl7hLOllsB
CSDMAZOnTjC3U/dDxGkAV53ijSLdhwZAAIEJzs4bg7/fzTtxRuLWZscFs3YnFo97
nh6Vfe63djMI2recBeKosqglVDBrwohZlgZvQjhDJLvpj0zbxIvsjGDCC7A7SFww
G5+bGEwXisMXTACw7XV/n1JsFlZgoQ হাতের লেখা অক্ষর Recognised Text VM/HMkSjtQoq8YxNIsoYiA+hflAAA=
-----END CERTIFICATE-----
`;
// NOTA: O conteúdo real do certificado foi removido por brevidade,
// mas o código o incluiria como uma string longa ou lido de um arquivo.
// Para este exemplo, vamos assumir que o sistema confia nele por padrão.
// Se ainda houver problemas de validação, podemos adicionar `ca: EFI_CA_CERT` às opções do agente.


// Validação de configuração
if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET) {
    console.error('ERRO: Variáveis de ambiente da Efí (CLIENT_ID, CLIENT_SECRET) não estão definidas!');
    throw new Error('Credenciais da Efí não encontradas.');
}
if (!EFI_CERT_PATH || !EFI_KEY_PATH) {
     console.error('ERRO CRÍTICO: Caminhos dos certificados Efí (EFI_CERT_PATH, EFI_KEY_PATH) não definidos. mTLS é OBRIGATÓRIO para API PIX.');
     // Considerar sair do processo se os certificados forem estritamente necessários: process.exit(1);
     // Por enquanto, apenas avisamos e deixamos a API falhar.
}

// Carrega os certificados
let certOptions = {};
let certificatesLoaded = false;
try {
    if (EFI_CERT_PATH && EFI_KEY_PATH && fs.existsSync(EFI_CERT_PATH) && fs.existsSync(EFI_KEY_PATH)) {
        certOptions = {
            cert: fs.readFileSync(EFI_CERT_PATH),
            key: fs.readFileSync(EFI_KEY_PATH),
            passphrase: EFI_CERT_PASSPHRASE,
            secureProtocol: 'TLSv1_2_method', // Força TLS 1.2
            minVersion: 'TLSv1.2', // Garante no mínimo TLS 1.2
            // ca: EFI_CA_CERT // Descomente se houver problemas de validação do certificado da Efí
        };
         console.log('Certificados Efí carregados com sucesso.');
         certificatesLoaded = true;
    } else if (EFI_CERT_PATH || EFI_KEY_PATH) {
         console.error(`ERRO: Um ou ambos os arquivos de certificado não foram encontrados nos caminhos: CERT='${EFI_CERT_PATH}', KEY='${EFI_KEY_PATH}'. Verifique as variáveis de ambiente no Render.`);
    } else {
        console.warn('Nenhum caminho de certificado fornecido. Operações PIX falharão.');
    }
} catch (err) {
    console.error('ERRO ao carregar os certificados Efí:', err.message);
}

// Log das opções de certificado (sem a chave/certificado em si)
const loggableCertOptions = {
    ...certOptions,
    cert: certOptions.cert ? '[Certificado Carregado]' : '[Não Carregado]',
    key: certOptions.key ? '[Chave Carregada]' : '[Não Carregada]',
    passphrase: certOptions.passphrase ? '[Senha Definida]' : '[Sem Senha]'
};
console.log('Opções de Certificado (logável):', JSON.stringify(loggableCertOptions, null, 2));


// Agente HTTPS COMUM para todas as chamadas - Forçando validação mútua
// Tentaremos usar rejectUnauthorized: true para ambos agora.
const commonAgentOptions = {
    ...certOptions,
    rejectUnauthorized: true // FORÇANDO TRUE PARA AMBOS
};
console.log('Opções do Agente Comum (commonAgent):', JSON.stringify({...commonAgentOptions, cert: loggableCertOptions.cert, key: loggableCertOptions.key}, null, 2));
const commonAgent = new https.Agent(commonAgentOptions);

// Exporta o agente configurado para ser usado em outras chamadas API
export const apiAgentWithCerts = commonAgent; // Exporta o agente comum


// Cache do token de acesso
let efiAccessToken = null;
let tokenExpires = 0;

export async function getEfiToken() {
    if (efiAccessToken && Date.now() < tokenExpires - 60000) {
        return efiAccessToken;
    }
    if (!certificatesLoaded && (EFI_CERT_PATH || EFI_KEY_PATH)) {
         throw new Error('Falha na autenticação: Certificados configurados mas não puderam ser carregados.');
    }
     if (!certificatesLoaded) {
         console.warn("Tentando obter token sem certificados carregados. Isso pode falhar dependendo da exigência da Efí para /oauth/token.");
     }

    console.log(`Gerando novo token de acesso Efí para: ${EFI_API_URL}`);
    const credentials = Buffer.from(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios({
            method: 'POST',
            url: `${EFI_API_URL}/oauth/token`,
            httpsAgent: commonAgent, // Usa o agente comum
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Garante que pedimos JSON
            },
            data: {
                grant_type: 'client_credentials'
            }
        });

        // Verifica se a resposta foi bem-sucedida e contém o token
        if (response.status === 200 && response.data && response.data.access_token) {
            efiAccessToken = response.data.access_token;
            tokenExpires = Date.now() + (response.data.expires_in * 1000);
            console.log('Token Efí gerado com sucesso.');
            return efiAccessToken;
        } else {
            // Se a resposta não for 200 ou não tiver o token, trata como erro
            console.error('Resposta inesperada ao obter token da Efí:');
            console.error('Status:', response.status);
            console.error('Data:', JSON.stringify(response.data, null, 2));
            throw new Error(`Resposta inesperada da Efí ao obter token (Status: ${response.status})`);
        }

    } catch (error) {
        console.error('Erro CRÍTICO ao obter token da Efí:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers da Resposta de Erro (Auth):', JSON.stringify(error.response.headers, null, 2));
             // Verifica se o erro foi HTML
             if (typeof error.response.data === 'string' && error.response.data.trim().toLowerCase().startsWith('<!doctype html')) {
                 console.error("Recebido HTML inesperado durante a autenticação. Verifique a URL e a configuração mTLS.");
             }
        } else if (error.request) {
            console.error('Nenhuma resposta recebida do servidor de autenticação Efí.');
            console.error('URL da requisição sem resposta:', error.config?.url);
        } else {
            console.error('Erro ao configurar request de autenticação:', error.message);
        }

        // Log extra sobre certificados
        if (!certificatesLoaded && (EFI_CERT_PATH || EFI_KEY_PATH)) {
             console.error('Contexto: Certificados configurados mas não carregados.');
        } else if (certificatesLoaded) {
             console.error('Contexto: Certificados carregados, mas autenticação falhou. Verifique Client ID/Secret, validade/correção dos certificados e se `rejectUnauthorized: true` é compatível com /oauth/token.');
        } else {
             console.error('Contexto: Nenhum certificado configurado. Autenticação básica falhou.');
        }
        throw new Error('Falha na autenticação com a Efí. Verifique logs detalhados, credenciais e certificados.');
    }
}

