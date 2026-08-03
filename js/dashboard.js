import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { initMobileNav } from "./nav.js";
import { getOrCreateHousehold, getMyMembership, updateMyIncomePercentage } from "./household.js";
import { listCategories, createCategory, updateCategory, deleteCategory, computeHealth, STATUS_LABEL } from "./categories.js";
import { listExpenses, sumByCategory, currentMonthRange } from "./expenses.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

let userId = null;
let household = null;
let categories = [];
let sums = new Map();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatCurrency(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statTile(label, value, opts = {}) {
  const cls = opts.direction === "up" ? "up" : opts.direction === "down" ? "down" : "";
  return `
    <div class="stat-tile">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${opts.delta ? `<div class="stat-delta ${cls}">${opts.delta}</div>` : ""}
    </div>`;
}

// ---------- Resumo ----------
function renderSummary() {
  const totalSpent = [...sums.values()].reduce((a, b) => a + b, 0);
  const totalBudget = categories.reduce((a, c) => a + (c.budget_amount || 0), 0);

  let redCount = 0;
  let yellowCount = 0;
  for (const c of categories) {
    const status = computeHealth(c, sums.get(c.id) || 0).status;
    if (status === "red") redCount++;
    if (status === "yellow") yellowCount++;
  }

  document.getElementById("summary-grid").innerHTML = [
    statTile("Gasto no mês", formatCurrency(totalSpent)),
    statTile("Total combinado", formatCurrency(totalBudget)),
    statTile("Órgãos no vermelho", String(redCount), redCount > 0 ? { direction: "down" } : {}),
    statTile("Órgãos em alerta", String(yellowCount)),
  ].join("");
}

// ---------- Órgãos ----------
function healthClass(status) {
  return status;
}

function orgCardHtml(category) {
  const spent = sums.get(category.id) || 0;
  const health = computeHealth(category, spent);
  const pct = health.percent == null ? 0 : Math.min(health.percent, 100);

  const amountsLine =
    category.budget_amount == null
      ? `${formatCurrency(spent)} gastos · sem acordo definido`
      : `${formatCurrency(spent)} de ${formatCurrency(category.budget_amount)}${
          health.percent > 100 ? ` (${Math.round(health.percent)}%)` : ""
        }`;

  return `
    <div class="org-card" data-category-id="${category.id}">
      <div class="org-header">
        <div>
          <div class="org-name">${escapeHtml(category.name)}</div>
          <div class="org-amounts">${amountsLine}</div>
        </div>
        <div class="org-actions">
          <button class="icon-btn edit-org-btn" data-id="${category.id}" title="Editar">✏️</button>
          <button class="icon-btn delete-org-btn" data-id="${category.id}" title="Excluir">🗑️</button>
        </div>
      </div>
      <div class="meter-track">
        <div class="meter-fill ${healthClass(health.status)}" style="width: ${pct}%"></div>
      </div>
      <div class="org-status ${healthClass(health.status)}">${STATUS_LABEL[health.status]}</div>
      <div class="org-edit-form" id="edit-form-${category.id}" style="display: none; margin-top: 14px"></div>
    </div>`;
}

function editFormHtml(category) {
  return `
    <div class="form-grid">
      <div class="field">
        <label>Nome do órgão</label>
        <input type="text" class="edit-name" value="${escapeHtml(category.name)}" />
      </div>
      <div class="field">
        <label>Acordo mensal (R$)</label>
        <input type="number" class="edit-budget" min="0" step="any" value="${category.budget_amount ?? ""}" placeholder="Sem limite definido" />
      </div>
      <div class="field">
        <label>Alerta amarelo (%)</label>
        <input type="number" class="edit-yellow" min="0" max="200" value="${category.threshold_yellow}" />
      </div>
      <div class="field">
        <label>Alerta vermelho (%)</label>
        <input type="number" class="edit-red" min="0" max="200" value="${category.threshold_red}" />
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn cancel-edit-btn" data-id="${category.id}">Cancelar</button>
      <button type="button" class="btn btn-primary save-edit-btn" data-id="${category.id}">Salvar</button>
    </div>`;
}

async function renderOrgGrid() {
  const grid = document.getElementById("org-grid");
  if (!categories.length) {
    grid.innerHTML = '<div class="empty-state">Nenhum órgão cadastrado ainda.</div>';
    return;
  }
  grid.innerHTML = categories.map(orgCardHtml).join("");

  grid.querySelectorAll(".edit-org-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const category = categories.find((c) => c.id === btn.dataset.id);
      const formEl = document.getElementById(`edit-form-${category.id}`);
      formEl.innerHTML = editFormHtml(category);
      formEl.style.display = "block";
      wireEditForm(category);
    })
  );

  grid.querySelectorAll(".delete-org-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este órgão? Os gastos já registrados nele continuam existindo, mas ele some da lista.")) return;
      await deleteCategory(btn.dataset.id);
      await refresh();
    })
  );
}

function wireEditForm(category) {
  const formEl = document.getElementById(`edit-form-${category.id}`);
  formEl.querySelector(".cancel-edit-btn").addEventListener("click", () => {
    formEl.style.display = "none";
  });
  formEl.querySelector(".save-edit-btn").addEventListener("click", async () => {
    const name = formEl.querySelector(".edit-name").value.trim();
    const budgetRaw = formEl.querySelector(".edit-budget").value;
    const yellow = Number(formEl.querySelector(".edit-yellow").value || 80);
    const red = Number(formEl.querySelector(".edit-red").value || 100);

    if (!name) {
      alert("Dê um nome pro órgão.");
      return;
    }

    await updateCategory(category.id, {
      name,
      budget_amount: budgetRaw === "" ? null : Number(budgetRaw),
      threshold_yellow: yellow,
      threshold_red: red,
    });
    await refresh();
  });
}

document.getElementById("add-org-btn").addEventListener("click", () => {
  const wrap = document.getElementById("add-org-form-wrap");
  const isOpen = wrap.style.display === "block";
  if (isOpen) {
    wrap.style.display = "none";
    return;
  }
  wrap.innerHTML = `
    <h2>Novo órgão</h2>
    <div class="field" style="max-width: 320px">
      <label for="new-org-name">Nome</label>
      <input type="text" id="new-org-name" placeholder="Ex: Educação, Pet, Assinaturas" />
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" id="save-new-org-btn">Adicionar</button>
    </div>`;
  wrap.style.display = "block";

  document.getElementById("save-new-org-btn").addEventListener("click", async () => {
    const name = document.getElementById("new-org-name").value.trim();
    if (!name) return;
    await createCategory(household.id, name);
    wrap.style.display = "none";
    await refresh();
  });
});

// ---------- Participação na renda ----------
async function renderIncomeCard() {
  const membership = await getMyMembership(household.id, userId);
  const card = document.getElementById("income-card");
  card.innerHTML = `
    <h2>Sua participação na renda da casa</h2>
    <p class="hint">
      Usado no futuro pra dividir contas fixas de forma proporcional (não necessariamente 50/50).
    </p>
    <div class="field" style="max-width: 200px; margin-top: 10px">
      <label for="income-percentage">Meu percentual (%)</label>
      <input type="number" id="income-percentage" min="0" max="100" step="any" value="${membership.income_percentage ?? ""}" placeholder="Ex: 60" />
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" id="save-income-btn">Salvar</button>
    </div>
    <p class="error-text" id="income-error" style="display: none"></p>`;

  document.getElementById("save-income-btn").addEventListener("click", async () => {
    const raw = document.getElementById("income-percentage").value;
    const errorEl = document.getElementById("income-error");
    errorEl.style.display = "none";
    try {
      await updateMyIncomePercentage(household.id, userId, raw === "" ? null : Number(raw));
    } catch (err) {
      errorEl.textContent = err.message || "Não foi possível salvar.";
      errorEl.style.display = "block";
    }
  });
}

// ---------- Carregamento ----------
async function refresh() {
  const [cats, { start, end }] = [await listCategories(household.id), currentMonthRange()];
  const expenses = await listExpenses(household.id, { start, end });

  categories = cats;
  sums = sumByCategory(expenses);

  renderSummary();
  await renderOrgGrid();
}

async function main() {
  if (!isConfigured) {
    banner.className = "config-banner";
    banner.textContent =
      "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para carregar seus dados.";
    return;
  }

  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  try {
    household = await getOrCreateHousehold(userId);
    await refresh();
    await renderIncomeCard();
  } catch (err) {
    document.querySelector(".container").innerHTML = `<p class="error-text">Erro ao carregar a casa: ${err.message}</p>`;
  }
}

main();
