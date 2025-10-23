// ===================================================================
// BACKEND PRODUÇÃO - EFÍ PIX API
// ===================================================================
// Arquivo: index.js
// Ambiente: PRODUÇÃO (https://api.efipay.com.br)
// Totalmente compatível com Render
// ===================================================================

import express from "express";
import cors from "cors";
import axios from "axios";
import https from "https";
import { getEfiToken } from "./efiAuth.js";

// ===================================================================
// ⚙️ CONFIGURAÇÕES PRINCIPAIS
// ===================================================================
const { EFI_PIX_KEY } = process.env;

if (!EFI_PIX_KEY) {
  console.error("❌ ERRO: Variável de ambiente EFI_PIX_KEY não está definida!");
  process.exit(1);
}

const EFI_PIX_URL = "https://api.efipay.com.br";
console.log(`🌐 Ambiente de Produção ativo | Base URL: ${EFI_PIX_URL}`);

// HTTPS Agent (necessário para API Efí)
const apiAgent = new https.Agent({
  rejectUnauthorized: false,
});

// ===================================================================
// 💾 ARMAZENAMENTO TEMPORÁRIO DE STATUS
// ===================================================================
const paymentStatus = new Map();

// ===================================================================
// 🚀 INICIALIZAÇÃO DO SERVIDOR EXPRESS
// ===================================================================
const app = express();
app.use(cors());
app.use(express.json());

// ===================================================================
// 💳 ENDPOINT: CRIAR COBRANÇA PIX
// ===================================================================
app.post("/create-charge", async (req, res) => {
  console.log("📩 Requisição recebida em /create-charge");

  try {
    const { valor, descricao } = req.body;

    if (!valor) {
      return res.status(400).json({ erro: "O campo 'valor' é obrigatório." });
    }

    console.log("🔐 Gerando token Efí...");
    const token = await getEfiToken();

    const payload = {
      calendario: { expiracao: 300 },
      valor: { original: valor },
      chave: EFI_PIX_KEY,
      solicitacaoPagador: descricao || "Pagamento via PIX Efí",
    };

    console.log("📤 Enviando payload para Efí (produção) /v2/cob...");

    const cobResponse = await axios.post(`${EFI_PIX_URL}/v2/cob`, payload, {
      httpsAgent: apiAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const cobData = cobResponse.data;

    if (!cobData?.loc?.id) {
      console.error("❌ Resposta inválida da Efí ao criar cobrança:", cobData);
      throw new Error("Resposta inválida da API Efí.");
    }

    const { txid, loc } = cobData;
    console.log(`✅ Cobrança criada com sucesso | TXID: ${txid} | LOC ID: ${loc.id}`);

    // Gera QR Code para o pagamento
    const qrResponse = await axios.get(`${EFI_PIX_URL}/v2/loc/${loc.id}/qrcode`, {
      httpsAgent: apiAgent,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const qrData = qrResponse.data;
    paymentStatus.set(txid, "PENDING");

    res.json({
      sucesso: true,
      txid,
      pixCopiaECola: qrData.qrcode,
      imagemQrcode: qrData.imagemQrcode,
      location: loc.location,
    });
  } catch (erro) {
    // ===================================================================
    // 🧠 LOG DETALHADO DE ERRO EFÍ
    // ===================================================================
    console.error("❌ Erro ao criar cobrança Efí:");
    if (erro.response) {
      console.error("Status:", erro.response.status);
      console.error("Headers:", JSON.stringify(erro.response.headers, null, 2));
      console.error("Data:", JSON.stringify(erro.response.data, null, 2));
    } else if (erro.request) {
      console.error("Nenhuma resposta da Efí. Request:", erro.request);
    } else {
      console.error("Mensagem:", erro.message);
    }

    res.status(500).json({
      erro: "Falha ao criar cobrança Efí. Verifique logs para detalhes.",
    });
  }
});

// ===================================================================
// 🔄 ENDPOINT: VERIFICAR STATUS DO PAGAMENTO
// ===================================================================
app.get("/check-payment/:txid", (req, res) => {
  const { txid } = req.params;
  const status = paymentStatus.get(txid) || "NOT_FOUND";

  if (status === "PAID") {
    paymentStatus.delete(txid);
  }

  res.json({ status });
});

// ===================================================================
// 📬 ENDPOINT: WEBHOOK DA EFÍ
// ===================================================================
app.post("/webhook", (req, res) => {
  console.log("📥 Webhook Efí recebido!");
  const { pix } = req.body;

  if (!pix || !Array.isArray(pix)) {
    return res.status(400).send("Formato inválido.");
  }

  for (const transacao of pix) {
    if (transacao.txid) {
      console.log(`💰 Pagamento confirmado | TXID: ${transacao.txid}`);
      paymentStatus.set(transacao.txid, "PAID");
    }
  }

  res.status(200).send("OK");
});

// ===================================================================
// 🧭 INICIAR SERVIDOR
// ===================================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em PRODUÇÃO na porta ${PORT}`);
});
