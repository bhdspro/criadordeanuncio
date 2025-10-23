import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ===============================
// 🔐 GERAR TOKEN EFÍ (PRODUÇÃO)
// ===============================
async function gerarTokenEfi() {
  const clientId = "SEU_CLIENT_ID_PRODUCAO";
  const clientSecret = "SEU_CLIENT_SECRET_PRODUCAO";

  const credenciais = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await axios.post(
      "https://api.efipay.com.br/v1/authorize",
      { grant_type: "client_credentials" },
      {
        headers: {
          Authorization: `Basic ${credenciais}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.access_token;
  } catch (erro) {
    console.error("❌ Erro ao gerar token Efí:", erro.response?.data || erro.message);
    throw new Error("Falha ao gerar token Efí.");
  }
}

// ===================================
// 💳 CRIAR COBRANÇA PIX (PRODUÇÃO)
// ===================================
async function criarCobrancaPix(dados) {
  try {
    console.log("Gerando token de acesso Efí (produção)...");
    const token = await gerarTokenEfi();

    const payload = {
      calendario: { expiracao: 300 },
      valor: { original: dados.valor },
      chave: "43988417004", // 🔑 Chave Pix cadastrada na conta Efí
      solicitacaoPagador: dados.descricao || "Pagamento Pix Efí",
    };

    console.log("Enviando payload para Efí (produção) /v2/cob...");

    const response = await axios.post(
      "https://api.efipay.com.br/v2/cob",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (erro) {
    console.error("❌ Erro ao criar cobrança Efí:", erro.response?.data || erro.message);
    throw new Error("Falha ao criar cobrança Efí.");
  }
}

// ===================================
// 🌐 ROTA PARA GERAR COBRANÇA PIX
// ===================================
app.post("/create-charge", async (req, res) => {
  try {
    const { valor, descricao } = req.body;

    if (!valor) {
      return res.status(400).json({ erro: "O campo 'valor' é obrigatório." });
    }

    const cobranca = await criarCobrancaPix({ valor, descricao });

    res.json({
      sucesso: true,
      txid: cobranca.txid,
      loc: cobranca.loc,
      location: cobranca.loc?.location,
      qrCodeUrl: cobranca.loc?.location, // URL de redirecionamento do QR Code
    });
  } catch (erro) {
    console.error("❌ Erro geral no endpoint /create-charge:", erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// ===================================
// 🚀 INICIAR SERVIDOR EXPRESS
// ===================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em produção na porta ${PORT}`);
});
