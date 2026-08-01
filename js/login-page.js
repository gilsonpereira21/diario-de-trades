import { isConfigured } from "./supabaseClient.js";
import { signIn, signUp, signInWithGoogle, redirectIfLoggedIn } from "./auth.js";

const banner = document.getElementById("config-banner");
if (!isConfigured) {
  banner.className = "config-banner";
  banner.textContent =
    "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para habilitar o login.";
} else {
  redirectIfLoggedIn();
}

let mode = "login";
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const submitBtn = document.getElementById("submit-btn");
const form = document.getElementById("auth-form");
const errorText = document.getElementById("error-text");

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", mode === "login");
  tabSignup.classList.toggle("active", mode === "signup");
  submitBtn.textContent = mode === "login" ? "Entrar" : "Criar conta";
  errorText.style.display = "none";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.style.display = "none";

  if (!isConfigured) {
    errorText.textContent = "Supabase ainda não foi configurado (js/config.js).";
    errorText.style.display = "block";
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  try {
    if (mode === "login") {
      await signIn(email, password);
      window.location.href = "index.html";
    } else {
      await signUp(email, password);
      errorText.style.color = "var(--success-text)";
      errorText.textContent =
        "Conta criada! Verifique seu e-mail para confirmar (se a confirmação estiver ativada) e faça login.";
      errorText.style.display = "block";
      setMode("login");
    }
  } catch (err) {
    errorText.style.color = "var(--critical)";
    errorText.textContent = err.message || "Não foi possível concluir. Tente novamente.";
    errorText.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

const googleBtn = document.getElementById("google-btn");
googleBtn.addEventListener("click", async () => {
  errorText.style.display = "none";
  if (!isConfigured) {
    errorText.textContent = "Supabase ainda não foi configurado (js/config.js).";
    errorText.style.display = "block";
    return;
  }
  googleBtn.disabled = true;
  try {
    await signInWithGoogle();
    // o navegador é redirecionado para o Google; se chegar aqui é porque falhou.
  } catch (err) {
    errorText.style.color = "var(--critical)";
    errorText.textContent = err.message || "Não foi possível iniciar o login com Google.";
    errorText.style.display = "block";
    googleBtn.disabled = false;
  }
});
