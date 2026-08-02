// Leitura de texto local via OCR (Tesseract.js, roda no navegador via WASM —
// sem servidor, sem chave de API, sem limite de uso). É bem menos "esperto"
// que a IA: só lê texto, não entende layout, então o parser abaixo é
// propositalmente heurístico e deve ser tratado como rascunho pelo usuário.

import { parseLocaleNumber, parseFlexibleDate, normalizeSide } from "./csv.js";

let tesseractPromise = null;
function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import("https://esm.sh/tesseract.js@5?bundle");
  }
  return tesseractPromise;
}

export async function recognizeText(file, onProgress) {
  const { default: Tesseract } = await loadTesseract();
  const { data } = await Tesseract.recognize(file, "por", {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  return data.text || "";
}

const SYMBOL_RE = /^[A-Z]{2,10}[0-9]{0,2}(\/[A-Z]{2,6})?$/;
const NUMBER_RE = /-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,8})?/g;
const DATE_RE = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/;

// Tenta reconhecer linhas de tabela dentro do texto extraído. Só considera
// uma linha "candidata a trade" quando acha, na mesma linha: um símbolo, uma
// palavra de lado (compra/venda/buy/sell) e pelo menos 2 números — o resto é
// ignorado silenciosamente (cabeçalhos, totais, textos decorativos etc.).
export function parseTradesFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates = [];

  for (const line of lines) {
    const tokens = line.split(/\s+/);

    const symbolToken = tokens.find((t) => SYMBOL_RE.test(t) && !/^\d+$/.test(t));
    if (!symbolToken) continue;

    const side = tokens.map(normalizeSide).find(Boolean);
    if (!side) continue;

    const numberMatches = [...line.matchAll(NUMBER_RE)]
      .map((m) => parseLocaleNumber(m[0]))
      .filter((n) => n != null && n !== 0);
    if (numberMatches.length < 2) continue;

    const dateMatch = line.match(DATE_RE);
    const entry_at = dateMatch ? parseFlexibleDate(dateMatch[0]) : null;

    candidates.push({
      asset: symbolToken.toUpperCase(),
      side,
      quantity: numberMatches[0],
      entry_price: numberMatches[1],
      exit_price: numberMatches[2] ?? null,
      // null se não achou data na linha — vira erro visível na revisão,
      // em vez de inventar uma data (ex: hoje) que não veio da imagem.
      entry_at: entry_at ? entry_at.toISOString() : null,
      exit_at: null,
      stop_loss: null,
      take_profit: null,
      notes: "Importado via OCR local — confira todos os valores.",
    });
  }

  return candidates;
}
