import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import {
  parseCSV,
  parseLocaleNumber,
  parseFlexibleDate,
  normalizeSide,
  guessMapping,
  FIELD_DEFINITIONS,
} from "./csv.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);

let userId = null;
let csvData = { headers: [], rows: [] };
let lastResults = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Passo 1: upload ----------
document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const uploadError = document.getElementById("upload-error");
  uploadError.style.display = "none";
  if (!file) return;

  try {
    const text = await file.text();
    csvData = parseCSV(text);
    if (!csvData.headers.length || !csvData.rows.length) {
      throw new Error("Não consegui ler nenhuma linha desse arquivo. Confira se é mesmo um CSV.");
    }
    renderMappingGrid(csvData.headers, guessMapping(csvData.headers));
    renderRawPreview(csvData.headers, csvData.rows.slice(0, 5));
    document.getElementById("step-mapping").style.display = "block";
    document.getElementById("step-review").style.display = "none";
  } catch (err) {
    uploadError.textContent = err.message || "Erro ao ler o arquivo.";
    uploadError.style.display = "block";
  }
});

// ---------- Passo 2: mapeamento ----------
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

function renderRawPreview(headers, rows) {
  const el = document.getElementById("raw-preview");
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

// ---------- Passo 3: analisar / revisar ----------
function buildTrades(mapping, sideValueMap) {
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
    if (exit_at && exit_price == null) {
      exit_at = null;
    }

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

function renderReview(results) {
  lastResults = results;
  const valid = results.filter((r) => r.trade);
  const invalid = results.filter((r) => !r.trade);

  document.getElementById("review-summary").innerHTML = `
    <p><strong>${valid.length}</strong> de ${results.length} linha(s) prontas para importar.
    ${invalid.length ? `<span style="color: var(--critical)">${invalid.length} com erro (serão ignoradas).</span>` : ""}</p>`;

  document.getElementById("review-table").innerHTML = `
    <table>
      <thead>
        <tr><th></th><th>Linha</th><th>Ativo</th><th>Lado</th><th>Qtd</th><th>Entrada</th><th>Status</th></tr>
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
    </table>`;

  document.getElementById("import-result").innerHTML = "";
  document.getElementById("import-error").style.display = "none";
}

document.getElementById("analyze-btn").addEventListener("click", () => {
  const mapping = getMappingFromGrid();
  const missing = FIELD_DEFINITIONS.filter((d) => d.required && !mapping[d.key]);
  if (missing.length) {
    alert(`Selecione as colunas obrigatórias: ${missing.map((d) => d.label).join(", ")}`);
    return;
  }
  const results = buildTrades(mapping, getSideValueMap());
  renderReview(results);
  document.getElementById("step-review").style.display = "block";
  document.getElementById("step-review").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("back-btn").addEventListener("click", () => {
  document.getElementById("step-review").style.display = "none";
  document.getElementById("step-mapping").scrollIntoView({ behavior: "smooth" });
});

// ---------- Passo 4: importar ----------
document.getElementById("import-btn").addEventListener("click", async () => {
  const importBtn = document.getElementById("import-btn");
  const importError = document.getElementById("import-error");
  importError.style.display = "none";

  const checked = new Set(
    [...document.querySelectorAll('[data-row]:checked')].map((el) => Number(el.dataset.row))
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
