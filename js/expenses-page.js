import { isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { initMobileNav } from "./nav.js";
import { getOrCreateHousehold } from "./household.js";
import { listCategories } from "./categories.js";
import { listExpenses, createExpense, deleteExpense, PAYMENT_METHODS, currentMonthRange } from "./expenses.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

let userId = null;
let household = null;
let categories = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatCurrency(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function categoryName(id) {
  return categories.find((c) => c.id === id)?.name || "—";
}

function paymentLabel(value) {
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || "—";
}

function populateSelects() {
  document.getElementById("category_id").innerHTML = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");

  document.getElementById("payment_method").innerHTML =
    '<option value="">—</option>' +
    PAYMENT_METHODS.map((p) => `<option value="${p.value}">${p.label}</option>`).join("");

  document.getElementById("expense_date").value = new Date().toISOString().slice(0, 10);
}

async function renderExpensesTable() {
  const { start, end } = currentMonthRange();
  const expenses = await listExpenses(household.id, { start, end });
  const el = document.getElementById("expenses-table");

  if (!expenses.length) {
    el.innerHTML = '<div class="empty-state">Nenhum gasto registrado este mês ainda.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll">
    <table>
      <thead>
        <tr><th>Data</th><th>Órgão</th><th>Valor</th><th>Pagamento</th><th>Descrição</th><th></th></tr>
      </thead>
      <tbody>
        ${expenses
          .map(
            (e) => `
          <tr data-id="${e.id}">
            <td>${new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
            <td>${escapeHtml(categoryName(e.category_id))}</td>
            <td>${formatCurrency(Number(e.amount))}</td>
            <td>${paymentLabel(e.payment_method)}</td>
            <td>${escapeHtml(e.description || "—")}</td>
            <td><button class="btn btn-danger delete-expense-btn" data-id="${e.id}">Excluir</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    </div>`;

  el.querySelectorAll(".delete-expense-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este gasto?")) return;
      await deleteExpense(btn.dataset.id);
      await renderExpensesTable();
    })
  );
}

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formError = document.getElementById("form-error");
  const saveBtn = document.getElementById("save-btn");
  formError.style.display = "none";

  const payload = {
    household_id: household.id,
    category_id: document.getElementById("category_id").value,
    user_id: userId,
    amount: Number(document.getElementById("amount").value),
    expense_date: document.getElementById("expense_date").value,
    payment_method: document.getElementById("payment_method").value || null,
    description: document.getElementById("description").value.trim() || null,
  };

  saveBtn.disabled = true;
  try {
    await createExpense(payload);
    document.getElementById("expense-form").reset();
    document.getElementById("expense_date").value = new Date().toISOString().slice(0, 10);
    await renderExpensesTable();
  } catch (err) {
    formError.textContent = err.message || "Não foi possível salvar o gasto.";
    formError.style.display = "block";
  } finally {
    saveBtn.disabled = false;
  }
});

async function main() {
  if (!isConfigured) {
    banner.className = "config-banner";
    banner.textContent =
      "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para registrar gastos.";
    return;
  }

  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  household = await getOrCreateHousehold(userId);
  categories = await listCategories(household.id);

  if (!categories.length) {
    document.querySelector(".container").innerHTML =
      '<p class="error-text">Cadastre pelo menos um órgão no <a href="index.html">Raio-X</a> antes de registrar gastos.</p>';
    return;
  }

  populateSelects();
  await renderExpensesTable();
}

main();
