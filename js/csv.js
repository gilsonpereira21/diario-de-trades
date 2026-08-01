// Parser de CSV genérico (aspas, delimitador auto-detectado) + helpers de
// normalização para lidar com exports de corretoras diferentes (BR e cripto).

export function guessDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const delimiter = guessDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignora, o \n do CRLF fecha a linha
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (nonEmpty[0] || []).map((h) => h.trim());
  const dataRows = nonEmpty.slice(1);
  return { headers, rows: dataRows, delimiter };
}

// Aceita "1.234,56" (BR), "1,234.56" (US), "1234.56", "R$ 1.234,56" etc.
export function parseLocaleNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  const negative = /^\(.*\)$/.test(s); // ex: (123,45) contábil = negativo
  s = s.replace(/[^0-9,.\-]/g, "");
  if (s === "" || s === "-") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length <= 2) {
      s = parts[0] + "." + last;
    } else {
      s = s.replace(/,/g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

// Aceita ISO (yyyy-mm-dd[THH:mm]) e dd/mm/yyyy [HH:mm].
export function parseFlexibleDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
    const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se);
    return isNaN(dt.getTime()) ? null : dt;
  }

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

const BUY_WORDS = new Set(["compra", "comprar", "c", "buy", "b", "long", "1"]);
const SELL_WORDS = new Set(["venda", "vender", "v", "sell", "s", "short", "-1"]);

export function normalizeSide(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (BUY_WORDS.has(s)) return "compra";
  if (SELL_WORDS.has(s)) return "venda";
  if (s.includes("compra") || s.includes("buy") || s.includes("long")) return "compra";
  if (s.includes("venda") || s.includes("sell") || s.includes("short")) return "venda";
  return null;
}

export const FIELD_DEFINITIONS = [
  { key: "asset", label: "Ativo", required: true, aliases: ["ativo", "ticker", "papel", "symbol", "simbolo", "código", "codigo", "instrumento", "asset", "par"] },
  { key: "side", label: "Lado (compra/venda)", required: true, aliases: ["lado", "operação", "operacao", "tipo", "side", "compra/venda", "c/v", "buy/sell"] },
  { key: "quantity", label: "Quantidade", required: true, aliases: ["quantidade", "qtd", "qtde", "quantity", "qty", "volume"] },
  { key: "entry_price", label: "Preço de entrada", required: true, aliases: ["preço médio", "preco medio", "preço entrada", "preco entrada", "preço", "preco", "price", "entry price", "preço unitário", "preco unitario", "pu"] },
  { key: "entry_at", label: "Data/hora de entrada", required: true, aliases: ["data", "data entrada", "data abertura", "data negociação", "data negociacao", "date", "entry date", "data/hora", "abertura"] },
  { key: "exit_price", label: "Preço de saída (opcional)", required: false, aliases: ["preço saída", "preco saida", "exit price", "preço de saída"] },
  { key: "exit_at", label: "Data/hora de saída (opcional)", required: false, aliases: ["data saída", "data saida", "data fechamento", "exit date", "fechamento"] },
  { key: "stop_loss", label: "Stop loss (opcional)", required: false, aliases: ["stop loss", "stop", "sl"] },
  { key: "take_profit", label: "Take profit (opcional)", required: false, aliases: ["take profit", "alvo", "tp"] },
  { key: "notes", label: "Notas (opcional)", required: false, aliases: ["notas", "observação", "observacao", "nota", "notes", "obs"] },
];

export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const { key, aliases } of FIELD_DEFINITIONS) {
    let found = headers.find(
      (h) => !used.has(h) && aliases.includes(h.trim().toLowerCase())
    );
    if (!found) {
      found = headers.find(
        (h) => !used.has(h) && aliases.some((a) => h.trim().toLowerCase().includes(a))
      );
    }
    if (found) {
      mapping[key] = found;
      used.add(found);
    }
  }
  return mapping;
}
