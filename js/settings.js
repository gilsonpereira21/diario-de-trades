import { supabase } from "./supabaseClient.js";

export async function getUserSettings() {
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error) throw error;
  return (
    data || {
      max_position_size: null,
      trading_start_time: null,
      trading_end_time: null,
      discipline_threshold: 80,
    }
  );
}

export async function saveUserSettings(userId, settings) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function hasAnyRuleConfigured(settings) {
  return (
    settings.max_position_size != null ||
    (settings.trading_start_time && settings.trading_end_time)
  );
}
