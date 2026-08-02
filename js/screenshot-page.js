import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { initMobileNav } from "./nav.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

const imageInput = document.getElementById("image-input");
const preview = document.getElementById("image-preview");
const analyzeBtn = document.getElementById("analyze-btn");
const errorText = document.getElementById("analyze-error");

let currentFile = null;

function setFile(file) {
  if (!file) return;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) return;

  currentFile = file;
  analyzeBtn.disabled = false;
  errorText.style.display = "none";

  const url = URL.createObjectURL(file);
  if (isImage) {
    preview.innerHTML = `<img src="${url}" alt="Preview do print" style="max-width: 100%; max-height: 360px; border-radius: 8px; border: 1px solid var(--border)" />`;
  } else {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    preview.innerHTML = `
      <div class="alert" style="border: 1px solid var(--border)">
        <span class="alert-icon">📄</span>
        <div><strong>${file.name}</strong><br />PDF selecionado (${sizeMb} MB)</div>
      </div>`;
  }
}

imageInput.addEventListener("change", (e) => setFile(e.target.files[0]));

document.addEventListener("paste", (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) setFile(item.getAsFile());
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

analyzeBtn.addEventListener("click", async () => {
  if (!currentFile) return;
  errorText.style.display = "none";
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

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Não foi possível ler esse arquivo.");

    sessionStorage.setItem("pendingImportTrade", JSON.stringify(result.trade));
    window.location.href = "trades.html";
  } catch (err) {
    errorText.textContent = err.message || "Erro ao analisar o arquivo.";
    errorText.style.display = "block";
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analisar com IA";
  }
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
}

main();
