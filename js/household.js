import { supabase } from "./supabaseClient.js";

const DEFAULT_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Dívidas",
  "Reserva",
];

// Cada usuário pertence a uma casa. Na primeira vez que loga, a casa é
// criada automaticamente com os 7 órgãos padrão (o usuário pode
// renomear/adicionar/remover depois).
export async function getOrCreateHousehold(userId) {
  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (memErr) throw memErr;

  if (membership) return fetchHousehold(membership.household_id);

  // Gera o id no cliente pra não depender do RETURNING do insert
  // (a policy de SELECT de households exige já ser membro, o que só passa
  // a existir depois do insert em household_members logo abaixo).
  const householdId = crypto.randomUUID();

  const { error: createErr } = await supabase
    .from("households")
    .insert({ id: householdId, name: "Minha casa" });
  if (createErr) throw createErr;

  const { error: memberErr } = await supabase
    .from("household_members")
    .insert({ household_id: householdId, user_id: userId });
  if (memberErr) throw memberErr;

  const { error: catErr } = await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((name, i) => ({ household_id: householdId, name, position: i }))
  );
  if (catErr) throw catErr;

  return fetchHousehold(householdId);
}

async function fetchHousehold(id) {
  const { data, error } = await supabase.from("households").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function getMyMembership(householdId, userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMyIncomePercentage(householdId, userId, percentage) {
  const { error } = await supabase
    .from("household_members")
    .update({ income_percentage: percentage })
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) throw error;
}
