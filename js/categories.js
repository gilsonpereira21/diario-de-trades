import { supabase } from "./supabaseClient.js";

export async function listCategories(householdId) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", householdId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory(householdId, name) {
  const { data: existing } = await supabase
    .from("categories")
    .select("position")
    .eq("household_id", householdId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    name,
    position: (existing?.position ?? -1) + 1,
  });
  if (error) throw error;
}

export async function updateCategory(id, patch) {
  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// Termômetro de saúde do órgão: verde / amarelo / vermelho / sem-acordo.
export function computeHealth(category, spentAmount) {
  if (category.budget_amount == null) {
    return { percent: null, status: "unset", spent: spentAmount };
  }

  const percent =
    category.budget_amount > 0
      ? (spentAmount / category.budget_amount) * 100
      : spentAmount > 0
      ? Infinity
      : 0;

  let status = "green";
  if (percent >= category.threshold_red) status = "red";
  else if (percent >= category.threshold_yellow) status = "yellow";

  return { percent, status, spent: spentAmount };
}

export const STATUS_LABEL = {
  green: "Dentro do combinado",
  yellow: "Perto do limite",
  red: "Estourou o combinado",
  unset: "Sem acordo definido",
};
