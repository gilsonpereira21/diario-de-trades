import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { parseFlexibleDate, normalizeSide } from "./csv.js";
import { initMobileNav } from "./nav.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

const imageInput = document.getElementById("image-input");
const preview = document.getElementById("image-preview");
const analyzeBtn = document.getElementById("analyze-btn");
const errorText = document.getElementById("analyze-error");
const stepReview = document.getElementById("step-review");

let currentFile = null;
let userId = null;
let lastResults = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setFile(file) {
  if (!file) return;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) return;

  currentFile = file;
  analyzeBtn.disabled = false;
  errorText.style.display = "none";
  stepReview.style.display = "none";

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
}

imageInput.addEventListener("change", (e) => setFile(e.target.files[0]));

document.addEventListener("paste", (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) setFile(item.getAsFile());
});

document.getElementById("back-btn").addEventListener("click", () => {
  stepReview.style.display = "none";
  preview.innerHTML = "";
  currentFile = null;
  analyzeBtn.disabled = true;
  imageInput.value = "";
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Validação/normalização das operações extraídas pela IA ----------
function buildTrades(rawTrades) {
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

function renderReview(results) {
  lastResults = results;
  const valid = results.filter((r) => r.trade);
  const invalid = results.filter((r) => !r.trade);

  document.getElementById("review-summary").innerHTML = valid.length
    ? `<p><strong>${valid.length}</strong> de ${results.length} operação(ões) encontrada(s) prontas para importar.
       ${invalid.length ? `<span style="color: var(--critical)">${invalid.length} com erro (serão ignoradas).</span>` : ""}
       A IA não sabe seu estado emocional — edite cada trade depois em "Trades" pra preencher.</p>`
    : `<p style="color: var(--critical)">Nenhuma operação reconhecida com segurança nesse arquivo. Tente um arquivo mais nítido, ou registre manualmente em "Trades".</p>`;

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
  stepReview.style.display = "block";
  stepReview.scrollIntoView({ behavior: "smooth" });
}

const MAX_FILE_BYTES = 4 * 1024 * 1024; // ~4MB originais (vira ~5.4MB em base64)

analyzeBtn.addEventListener("click", async () => {
  if (!currentFile) return;
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

    renderReview(buildTrades(result.trades || []));
  } catch (err) {
    errorText.textContent = err.message || "Erro ao analisar o arquivo.";
    errorText.style.display = "block";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analisar com IA";
  }
});

// ---------- Importar ----------
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
