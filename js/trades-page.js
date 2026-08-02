import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { EMOTIONS, emotionEmoji, emotionLabel } from "./emotions.js";
import { pnl, pnlPercent } from "./metrics.js";
import { initMobileNav } from "./nav.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

const form = document.getElementById("trade-form");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");
const cancelBtn = document.getElementById("cancel-edit");
const saveBtn = document.getElementById("save-btn");

const fields = [
  "asset",
  "side",
  "quantity",
  "entry_price",
  "entry_at",
  "stop_loss",
  "take_profit",
  "emotion_before",
  "exit_price",
  "exit_at",
  "emotion_after",
  "notes",
];

function populateEmotionSelects() {
  for (const id of ["emotion_before", "emotion_after"]) {
    const select = document.getElementById(id);
    select.innerHTML =
      '<option value="">—</option>' +
      EMOTIONS.map((e) => `<option value="${e.value}">${e.emoji} ${e.label}</option>`).join("");
  }
}
populateEmotionSelects();

function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resetForm() {
  form.reset();
  document.getElementById("trade-id").value = "";
  formTitle.textContent = "Registrar trade";
  saveBtn.textContent = "Salvar trade";
  cancelBtn.style.display = "none";
  formError.style.display = "none";
}

cancelBtn.addEventListener("click", resetForm);

function fillFormFromTrade(trade) {
  document.getElementById("trade-id").value = trade.id;
  document.getElementById("asset").value = trade.asset;
  document.getElementById("side").value = trade.side;
  document.getElementById("quantity").value = trade.quantity;
  document.getElementById("entry_price").value = trade.entry_price;
  document.getElementById("entry_at").value = toDatetimeLocal(trade.entry_at);
  document.getElementById("stop_loss").value = trade.stop_loss ?? "";
  document.getElementById("take_profit").value = trade.take_profit ?? "";
  document.getElementById("emotion_before").value = trade.emotion_before || "";
  document.getElementById("exit_price").value = trade.exit_price ?? "";
  document.getElementById("exit_at").value = toDatetimeLocal(trade.exit_at);
  document.getElementById("emotion_after").value = trade.emotion_after || "";
  document.getElementById("notes").value = trade.notes || "";

  formTitle.textContent = `Editando trade — ${trade.asset}`;
  saveBtn.textContent = "Atualizar trade";
  cancelBtn.style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatCurrency(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function loadTrades() {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("entry_at", { ascending: false });
  if (error) throw error;
  return data;
}

function renderTable(trades) {
  const el = document.getElementById("trades-table");
  if (!trades.length) {
    el.innerHTML = '<div class="empty-state">Nenhum trade registrado ainda.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Entrada</th><th>Ativo</th><th>Lado</th><th>Qtd</th><th>Resultado</th>
          <th>Emoção antes</th><th>Emoção depois</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${trades
          .map((t) => {
            const p = pnl(t);
            const isOpen = t.exit_price == null;
            return `
            <tr data-id="${t.id}">
              <td>${new Date(t.entry_at).toLocaleDateString("pt-BR")}</td>
              <td>${t.asset}</td>
              <td>${t.side}</td>
              <td>${t.quantity}</td>
              <td>${isOpen ? '<span class="pill">aberto</span>' : `<span class="pill ${p >= 0 ? "win" : "loss"}">${formatCurrency(p)} (${pnlPercent(t).toFixed(1)}%)</span>`}</td>
              <td class="emoji-emotion">${emotionEmoji(t.emotion_before)} ${emotionLabel(t.emotion_before)}</td>
              <td class="emoji-emotion">${emotionEmoji(t.emotion_after)} ${emotionLabel(t.emotion_after)}</td>
              <td style="white-space:nowrap">
                <button class="btn edit-btn" data-id="${t.id}">Editar</button>
                <button class="btn btn-danger delete-btn" data-id="${t.id}">Excluir</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    </div>`;

  el.querySelectorAll(".edit-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const trade = trades.find((t) => t.id === btn.dataset.id);
      fillFormFromTrade(trade);
    })
  );

  el.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este trade? Essa ação não pode ser desfeita.")) return;
      const { error } = await supabase.from("trades").delete().eq("id", btn.dataset.id);
      if (error) {
        alert(`Erro ao excluir: ${error.message}`);
        return;
      }
      refresh();
    })
  );
}

let userId = null;

async function refresh() {
  const trades = await loadTrades();
  renderTable(trades);
}

function readForm() {
  const val = (id) => document.getElementById(id).value;
  const numOrNull = (id) => (val(id) === "" ? null : Number(val(id)));
  const isoOrNull = (id) => (val(id) === "" ? null : new Date(val(id)).toISOString());

  return {
    asset: val("asset").trim().toUpperCase(),
    side: val("side"),
    quantity: Number(val("quantity")),
    entry_price: Number(val("entry_price")),
    entry_at: new Date(val("entry_at")).toISOString(),
    stop_loss: numOrNull("stop_loss"),
    take_profit: numOrNull("take_profit"),
    emotion_before: val("emotion_before") || null,
    exit_price: numOrNull("exit_price"),
    exit_at: isoOrNull("exit_at"),
    emotion_after: val("emotion_after") || null,
    notes: val("notes") || null,
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.style.display = "none";

  const payload = readForm();
  if (payload.exit_price != null && !payload.exit_at) {
    formError.textContent = "Informe a data/hora de saída para um trade fechado.";
    formError.style.display = "block";
    return;
  }

  const tradeId = document.getElementById("trade-id").value;
  saveBtn.disabled = true;
  try {
    if (tradeId) {
      const { error } = await supabase.from("trades").update(payload).eq("id", tradeId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("trades").insert({ ...payload, user_id: userId });
      if (error) throw error;
    }
    resetForm();
    await refresh();
  } catch (err) {
    formError.textContent = err.message || "Não foi possível salvar o trade.";
    formError.style.display = "block";
  } finally {
    saveBtn.disabled = false;
  }
});

async function main() {
  if (!isConfigured) {
    banner.className = "config-banner";
    banner.textContent =
      "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para registrar trades.";
    renderTable([]);
    return;
  }

  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  await refresh();
}

main();
