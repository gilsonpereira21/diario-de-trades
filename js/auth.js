import { supabase, isConfigured } from "./supabaseClient.js";

export async function requireSession() {
  if (!isConfigured) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session;
}

export async function redirectIfLoggedIn() {
  if (!isConfigured) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = "index.html";
  }
}

export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/index.html` },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
