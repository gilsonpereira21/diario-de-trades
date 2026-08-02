import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import {
  parseCSV,
  parseHTMLTables,
  parseLocaleNumber,
  parseFlexibleDate,
  normalizeSide,
  guessMapping,
  FIELD_DEFINITIONS,
} from "./csv.js";
import { recognizeText, parseTradesFromText } from "./ocr.js";
import { initMobileNav } from "./nav.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

let userId = null;
let csvData = { headers: [], rows: [] };
let currentFile = null;
let lastResults = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const STEP_IDS = ["step-table-choice", "step-mapping", "step-analyze", "step-review"];
function resetSteps() {
  STEP_IDS.forEach((id) => (document.getElementById(id).style.display = "none"));
  document.getElementById("upload-error").style.display = "none";
  document.getElementById("analyze-error").style.display = "none";
  document.getElementById("ocr-raw-text-wrap").style.display = "none";
}

// ---------- Passo 1: upload ----------
document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  resetSteps();
  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  if (isImage || isPdf) {
    showAnalyzeStep(file, isImage);
    return;
  }

  const uploadError = document.getElementById("upload-error");
  try {
    const text = await file.text();
    const looksLikeHtml =
      file.type === "text/html" ||
      /\.html?$/i.test(file.name) ||
      /^\s*<(!doctype|html)/i.test(text);

    if (looksLikeHtml) {
      const tables = parseHTMLTables(text);
      if (!tables.length) throw new Error("Não encontrei nenhuma tabela legível nesse HTML.");
      if (tables.length === 1) proceedWithTable(tables[0]);
      else showTableChoice(tables);
    } else {
      const parsed = parseCSV(text);
      if (!parsed.headers.length || !parsed.rows.length) {
        throw new Error("Não consegui ler nenhuma linha desse arquivo. Confira se é mesmo um CSV.");
      }
      proceedWithTable(parsed);
    }
  } catch (err) {
    uploadError.textContent = err.message || "Erro ao ler o arquivo.";
    uploadError.style.display = "block";
  }
});

document.addEventListener("paste", (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) {
    resetSteps();
    showAnalyzeStep(item.getAsFile(), true);
  }
});

// ---------- Caminho planilha (CSV/HTML) ----------
function proceedWithTable(table) {
  csvData = table;
  renderMappingGrid(csvData.headers, guessMapping(csvData.headers));
  renderRawPreview(csvData.headers, csvData.rows.slice(0, 5));
  document.getElementById("step-mapping").style.display = "block";
}

function showTableChoice(tables) {
  const select = document.getElementById("table-choice-select");
  const bestIndex = tables.reduce(
    (best, t, i) => (t.rows.length > tables[best].rows.length ? i : best),
    0
  );

  select.innerHTML = tables
    .map((t, i) => {
      const preview = t.headers.slice(0, 4).map(escapeHtml).join(", ");
      return `<option value="${i}" ${i === bestIndex ? "selected" : ""}>Tabela ${i + 1} — ${t.headers.length} colunas, ${t.rows.length} linhas (${preview}${t.headers.length > 4 ? "…" : ""})</option>`;
    })
    .join("");

  const renderChoicePreview = () => {
    const t = tables[Number(select.value)];
    renderRawPreview(t.headers, t.rows.slice(0, 5), "table-choice-preview");
  };
  select.onchange = renderChoicePreview;
  renderChoicePreview();

  document.getElementById("table-choice-confirm").onclick = () => {
    document.getElementById("step-table-choice").style.display = "none";
    proceedWithTable(tables[Number(select.value)]);
  };

  document.getElementById("step-table-choice").style.display = "block";
}

function renderMappingGrid(headers, guessed) {
  const grid = document.getElementById("mapping-grid");
  grid.innerHTML = FIELD_DEFINITIONS.map(
    (def) => `
    <div class="field">
      <label for="map-${def.key}">${def.label}${def.required ? " *" : ""}</label>
      <select id="map-${def.key}">
        <option value="">— não usar —</option>
        ${headers
          .map(
            (h) =>
              `<option value="${escapeHtml(h)}" ${guessed[def.key] === h ? "selected" : ""}>${escapeHtml(h)}</option>`
          )
          .join("")}
      </select>
    </div>`
  ).join("");

  document.getElementById("map-side").addEventListener("change", renderSideValueMapping);
  renderSideValueMapping();
}

function renderRawPreview(headers, rows, targetId = "raw-preview") {
  const el = document.getElementById(targetId);
  el.innerHTML = `
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((r) => `<tr>${headers.map((_, i) => `<td>${escapeHtml(r[i] ?? "")}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>`;
}

function getMappingFromGrid() {
  const mapping = {};
  for (const def of FIELD_DEFINITIONS) {
    mapping[def.key] = document.getElementById(`map-${def.key}`).value || null;
  }
  return mapping;
}

function renderSideValueMapping() {
  const sideHeader = document.getElementById("map-side").value;
  const wrap = document.getElementById("side-mapping-wrap");
  if (!sideHeader) {
    wrap.innerHTML = "";
    return;
  }
  const idx = csvData.headers.indexOf(sideHeader);
  const uniqueValues = [
    ...new Set(csvData.rows.map((r) => (r[idx] || "").trim()).filter((v) => v !== "")),
  ];

  wrap.innerHTML = `
    <h3 style="font-size: 13px; margin: 0 0 8px">
      Confirme o que cada valor da coluna "${escapeHtml(sideHeader)}" significa
    </h3>
    <div class="form-grid">
      ${uniqueValues
        .map((v) => {
          const guess = normalizeSide(v) || "compra";
          return `
          <div class="field">
            <label>"${escapeHtml(v)}" é</label>
            <select data-side-value="${escapeHtml(v)}">
              <option value="compra" ${guess === "compra" ? "selected" : ""}>Compra</option>
              <option value="venda" ${guess === "venda" ? "selected" : ""}>Venda</option>
            </select>
          </div>`;
        })
        .join("")}
    </div>`;
}

function getSideValueMap() {
  const map = {};
  document.querySelectorAll("[data-side-value]").forEach((sel) => {
    map[sel.dataset.sideValue] = sel.value;
  });
  return map;
}

function buildTradesFromMapping(mapping, sideValueMap) {
  const colIndex = (key) => (mapping[key] ? csvData.headers.indexOf(mapping[key]) : -1);
  const cols = Object.fromEntries(FIELD_DEFINITIONS.map((d) => [d.key, colIndex(d.key)]));
  const get = (row, key) => (cols[key] === -1 ? "" : (row[cols[key]] ?? "").trim());

  return csvData.rows.map((row, i) => {
    const errors = [];
    let warning = null;

    const asset = get(row, "asset").toUpperCase();
    if (!asset) errors.push("ativo vazio");

    const rawSide = get(row, "side");
    const side = sideValueMap[rawSide] || normalizeSide(rawSide);
    if (!side) errors.push("lado não reconhecido");

    const quantity = parseLocaleNumber(get(row, "quantity"));
    if (quantity == null || quantity <= 0) errors.push("quantidade inválida");

    const entry_price = parseLocaleNumber(get(row, "entry_price"));
    if (entry_price == null || entry_price <= 0) errors.push("preço de entrada inválido");

    const entry_at = parseFlexibleDate(get(row, "entry_at"));
    if (!entry_at) errors.push("data de entrada inválida");

    let exit_price = cols.exit_price !== -1 ? parseLocaleNumber(get(row, "exit_price")) : null;
    let exit_at = cols.exit_at !== -1 ? parseFlexibleDate(get(row, "exit_at")) : null;

    if (exit_price != null && !exit_at) {
      warning = "importado como trade aberto (faltou data de saída)";
      exit_price = null;
    }
    if (exit_at && exit_price == null) exit_at = null;

    const stop_loss = cols.stop_loss !== -1 ? parseLocaleNumber(get(row, "stop_loss")) : null;
    const take_profit = cols.take_profit !== -1 ? parseLocaleNumber(get(row, "take_profit")) : null;
    const notes = cols.notes !== -1 ? get(row, "notes") || null : null;

    const trade =
      errors.length === 0
        ? {
            asset,
            side,
            quantity,
            entry_price,
            entry_at: entry_at.toISOString(),
            exit_price,
            exit_at: exit_at ? exit_at.toISOString() : null,
            stop_loss,
            take_profit,
            emotion_before: null,
            emotion_after: null,
            notes,
          }
        : null;

    return { rowNumber: i + 2, trade, errors, warning };
  });
}

document.getElementById("mapping-analyze-btn").addEventListener("click", () => {
  const mapping = getMappingFromGrid();
  const missing = FIELD_DEFINITIONS.filter((d) => d.required && !mapping[d.key]);
  if (missing.length) {
    alert(`Selecione as colunas obrigatórias: ${missing.map((d) => d.label).join(", ")}`);
    return;
  }
  renderReview(buildTradesFromMapping(mapping, getSideValueMap()));
});

// ---------- Caminho print/PDF (IA ou OCR) ----------
function showAnalyzeStep(file, isImage) {
  currentFile = file;
  const preview = document.getElementById("analyze-preview");
  const url = URL.createObjectURL(file);

  if (isImage) {
    preview.innerHTML = `<img src="${url}" alt="Preview do print" style="max-width: 100%; max-height: 360px; border-radius: 8px; border: 1px solid var(--border)" />`;
  } else {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    preview.innerHTML = `
      <div class="alert" style="border: 1px solid var(--border)">
        <span class="alert-icon">📄</span>
        <div><strong>${escapeHtml(file.name)}</strong><br />PDF selecionado (${sizeMb} MB)</div>
      </div>`;
  }

  document.getElementById("ocr-fallback-link").style.display = isImage ? "inline" : "none";
  document.getElementById("step-analyze").style.display = "block";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildTradesFromExtracted(rawTrades) {
  return rawTrades.map((raw, i) => {
    const errors = [];
    let warning = null;

    const asset = (raw.asset || "").toString().trim().toUpperCase();
    if (!asset) errors.push("ativo vazio");

    const side = raw.side === "compra" || raw.side === "venda" ? raw.side : normalizeSide(raw.side);
    if (!side) errors.push("lado não reconhecido");

    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push("quantidade inválida");

    const entry_price = Number(raw.entry_price);
    if (!Number.isFinite(entry_price) || entry_price <= 0) errors.push("preço de entrada inválido");

    const entry_at = raw.entry_at ? parseFlexibleDate(raw.entry_at) : null;
    if (!entry_at) errors.push("data de entrada inválida");

    let exit_price = raw.exit_price != null ? Number(raw.exit_price) : null;
    if (exit_price != null && !Number.isFinite(exit_price)) exit_price = null;
    let exit_at = raw.exit_at ? parseFlexibleDate(raw.exit_at) : null;

    if (exit_price != null && !exit_at) {
      warning = "importado como trade aberto (faltou data de saída)";
      exit_price = null;
    }
    if (exit_at && exit_price == null) exit_at = null;

    const stop_loss = raw.stop_loss != null && Number.isFinite(Number(raw.stop_loss)) ? Number(raw.stop_loss) : null;
    const take_profit = raw.take_profit != null && Number.isFinite(Number(raw.take_profit)) ? Number(raw.take_profit) : null;
    const notes = raw.notes ? String(raw.notes) : null;

    const trade =
      errors.length === 0
        ? {
            asset,
            side,
            quantity,
            entry_price,
            entry_at: entry_at.toISOString(),
            exit_price,
            exit_at: exit_at ? exit_at.toISOString() : null,
            stop_loss,
            take_profit,
            emotion_before: null,
            emotion_after: null,
            notes,
          }
        : null;

    return { rowNumber: i + 1, trade, errors, warning };
  });
}

const MAX_FILE_BYTES = 4 * 1024 * 1024;

document.getElementById("ai-analyze-btn").addEventListener("click", async () => {
  if (!currentFile) return;
  const errorText = document.getElementById("analyze-error");
  const analyzeBtn = document.getElementById("ai-analyze-btn");
  errorText.style.display = "none";

  if (currentFile.size > MAX_FILE_BYTES) {
    errorText.textContent = `Arquivo grande demais (${(currentFile.size / (1024 * 1024)).toFixed(1)}MB, limite ~4MB). Tente um arquivo menor ou com menos páginas/qualidade mais baixa.`;
    errorText.style.display = "block";
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analisando...";

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw new Error("Sessão expirada, faça login novamente.");

    const imageBase64 = await fileToBase64(currentFile);
    const res = await fetch("/.netlify/functions/parse-trade-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({ imageBase64, mimeType: currentFile.type }),
    });

    const rawText = await res.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Resposta inesperada do servidor (status ${res.status}). ${
          res.status === 413
            ? "O arquivo provavelmente é grande demais (limite ~6MB)."
            : `Detalhe: ${rawText.slice(0, 150)}`
        }`
      );
    }
    if (!res.ok) throw new Error(result.error || "Não foi possível ler esse arquivo.");

    renderReview(buildTradesFromExtracted(result.trades || []));
  } catch (err) {
    errorText.textContent = err.message || "Erro ao analisar o arquivo.";
    errorText.style.display = "block";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analisar com IA";
  }
});

document.getElementById("ocr-fallback-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!currentFile) return;
  const errorText = document.getElementById("analyze-error");
  const link = document.getElementById("ocr-fallback-link");
  errorText.style.display = "none";
  const originalLabel = link.textContent;

  try {
    const text = await recognizeText(currentFile, (pct) => {
      link.textContent = `Lendo imagem... ${pct}%`;
    });

    const rawTextWrap = document.getElementById("ocr-raw-text-wrap");
    document.getElementById("ocr-raw-text").textContent = text || "(nenhum texto reconhecido)";
    rawTextWrap.style.display = "block";

    const candidates = parseTradesFromText(text);
    if (!candidates.length) {
      errorText.textContent =
        "O OCR não conseguiu reconhecer nenhuma operação com o padrão esperado (ativo + lado + números na mesma linha). Veja o texto bruto abaixo, ou tente a leitura com IA.";
      errorText.style.display = "block";
      return;
    }

    renderReview(buildTradesFromExtracted(candidates));
  } catch (err) {
    errorText.textContent = err.message || "Erro ao ler o texto da imagem.";
    errorText.style.display = "block";
  } finally {
    link.textContent = originalLabel;
  }
});

// ---------- Revisão + importação (compartilhado pelos dois caminhos) ----------
function renderReview(results) {
  lastResults = results;
  const valid = results.filter((r) => r.trade);
  const invalid = results.filter((r) => !r.trade);

  document.getElementById("review-summary").innerHTML = valid.length
    ? `<p><strong>${valid.length}</strong> de ${results.length} operação(ões) prontas para importar.
       ${invalid.length ? `<span style="color: var(--critical)">${invalid.length} com erro (serão ignoradas).</span>` : ""}
       Nenhum estado emocional é preenchido automaticamente — edite cada trade depois em "Trades" pra completar.</p>`
    : `<p style="color: var(--critical)">Nenhuma operação reconhecida com segurança. Corrija o mapeamento acima, tente outro arquivo, ou registre manualmente em "Trades".</p>`;

  document.getElementById("review-table").innerHTML = results.length
    ? `
    <table>
      <thead>
        <tr><th></th><th>#</th><th>Ativo</th><th>Lado</th><th>Qtd</th><th>Entrada</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${results
          .map((r) => {
            if (r.trade) {
              return `
              <tr>
                <td><input type="checkbox" checked data-row="${r.rowNumber}" /></td>
                <td>${r.rowNumber}</td>
                <td>${escapeHtml(r.trade.asset)}</td>
                <td>${r.trade.side}</td>
                <td>${r.trade.quantity}</td>
                <td>${new Date(r.trade.entry_at).toLocaleDateString("pt-BR")}</td>
                <td>${r.warning ? `<span class="pill" style="color: var(--warning)">⚠ ${escapeHtml(r.warning)}</span>` : '<span class="pill win">ok</span>'}</td>
              </tr>`;
            }
            return `
            <tr style="opacity: 0.6">
              <td></td>
              <td>${r.rowNumber}</td>
              <td colspan="4">—</td>
              <td><span class="pill loss">${escapeHtml(r.errors.join(", "))}</span></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`
    : "";

  document.getElementById("import-result").innerHTML = "";
  document.getElementById("import-error").style.display = "none";
  document.getElementById("step-review").style.display = "block";
  document.getElementById("step-review").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("back-btn").addEventListener("click", () => {
  resetSteps();
  document.getElementById("file-input").value = "";
  currentFile = null;
  csvData = { headers: [], rows: [] };
});

document.getElementById("import-btn").addEventListener("click", async () => {
  const importBtn = document.getElementById("import-btn");
  const importError = document.getElementById("import-error");
  importError.style.display = "none";

  const checked = new Set(
    [...document.querySelectorAll("[data-row]:checked")].map((el) => Number(el.dataset.row))
  );
  const toImport = lastResults.filter((r) => r.trade && checked.has(r.rowNumber));

  if (!toImport.length) {
    importError.textContent = "Nenhum trade selecionado para importar.";
    importError.style.display = "block";
    return;
  }

  importBtn.disabled = true;
  importBtn.textContent = "Importando...";

  const CHUNK = 300;
  let imported = 0;
  const failures = [];

  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK).map((r) => ({ ...r.trade, user_id: userId }));
    const { error } = await supabase.from("trades").insert(chunk);
    if (error) failures.push(error.message);
    else imported += chunk.length;
  }

  importBtn.disabled = false;
  importBtn.textContent = "Importar trades válidos";

  document.getElementById("import-result").innerHTML = `
    <div class="alert ${failures.length ? "warning" : ""}" style="border: 1px solid var(--border)">
      <span class="alert-icon">${failures.length ? "⚠️" : "✅"}</span>
      <div>
        <strong>${imported} trade(s) importado(s) com sucesso.</strong>
        ${failures.length ? `${failures.length} lote(s) falharam: ${escapeHtml(failures.join(" | "))}` : `Confira em <a href="trades.html">Trades</a> ou no <a href="index.html">Dashboard</a>.`}
      </div>
    </div>`;
});

async function main() {
  if (!isConfigured) {
    banner.className = "config-banner";
    banner.textContent =
      "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para importar trades.";
    return;
  }
  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;
}

main();
