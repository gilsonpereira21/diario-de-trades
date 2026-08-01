// Recebe um print de operação de trading (base64), pede pro Gemini extrair
// os dados estruturados, e devolve o JSON pronto pra revisão no frontend.
//
// Fica no servidor (não no navegador) só porque a GEMINI_API_KEY é secreta —
// diferente da chave "anon" do Supabase, essa não pode ser exposta no cliente.

const MAX_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB de imagem original em base64
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    asset: { type: "STRING", description: "Ticker/símbolo do ativo, ex: PETR4, BTCUSD" },
    side: { type: "STRING", enum: ["compra", "venda"] },
    quantity: { type: "NUMBER" },
    entry_price: { type: "NUMBER" },
    exit_price: { type: "NUMBER", nullable: true },
    entry_at: { type: "STRING", nullable: true, description: "ISO 8601, ex: 2026-08-01T14:30:00" },
    exit_at: { type: "STRING", nullable: true, description: "ISO 8601" },
    stop_loss: { type: "NUMBER", nullable: true },
    take_profit: { type: "NUMBER", nullable: true },
    notes: { type: "STRING", nullable: true },
  },
  required: ["asset", "side", "quantity", "entry_price"],
};

const PROMPT = `Você está vendo um print de tela de uma corretora ou plataforma de trading
(ações, cripto ou forex) mostrando uma operação.

Extraia os dados dessa operação no formato JSON pedido. Regras:
- "side": use exatamente "compra" ou "venda" (compra = long/buy, venda = short/sell).
- Datas em ISO 8601 (aaaa-mm-ddThh:mm:ss). Se não houver hora visível, use 00:00:00.
  Se não houver data nenhuma visível, use null.
- Se um campo não aparecer na imagem, retorne null para ele (exceto asset, side,
  quantity e entry_price, que são obrigatórios — faça sua melhor estimativa se
  não estiverem 100% claros).
- Não invente valores que não conseguir ler na imagem.`;

async function verifySupabaseUser(authHeader) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !authHeader) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  return res.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método não permitido." }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const authorized = await verifySupabaseUser(authHeader);
  if (!authorized) {
    return { statusCode: 401, body: JSON.stringify({ error: "Não autenticado." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Corpo da requisição inválido." }) };
  }

  const { imageBase64, mimeType } = payload;
  if (!imageBase64 || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ error: "Envie imageBase64 e mimeType." }) };
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Formato de imagem não suportado." }) };
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return { statusCode: 413, body: JSON.stringify({ error: "Imagem muito grande (máx. ~6MB)." }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY não configurada no servidor." }) };
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Falha ao consultar a IA.", detail: errText.slice(0, 500) }),
      };
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: "A IA não retornou dados legíveis dessa imagem." }) };
    }

    const trade = JSON.parse(text);
    return { statusCode: 200, body: JSON.stringify({ trade }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erro inesperado.", detail: String(err) }) };
  }
};
