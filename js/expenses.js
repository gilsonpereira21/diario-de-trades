import { supabase } from "./supabaseClient.js";

export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "pix", label: "Pix" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

export function currentMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const toISODate = (d) => d.toISOString().slice(0, 10);
  return { start: toISODate(start), end: toISODate(end) };
}

export async function listExpenses(householdId, { start, end } = {}) {
  let query = supabase
    .from("expenses")
    .select("*")
    .eq("household_id", householdId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (start) query = query.gte("expense_date", start);
  if (end) query = query.lte("expense_date", end);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createExpense(payload) {
  const { error } = await supabase.from("expenses").insert(payload);
  if (error) throw error;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export function sumByCategory(expenses) {
  const totals = new Map();
  for (const e of expenses) {
    totals.set(e.category_id, (totals.get(e.category_id) || 0) + Number(e.amount));
  }
  return totals;
}
