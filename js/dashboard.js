import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { initMobileNav } from "./nav.js";
import {
  computeMetrics,
  performanceByAsset,
  performanceByWeekday,
  pnl,
} from "./metrics.js";
import { detectPatterns } from "./patterns.js";
import { renderEquityCurve, renderPerformanceBars } from "./charts.js";
import { emotionEmoji, emotionLabel } from "./emotions.js";
import { getUserSettings, saveUserSettings, hasAnyRuleConfigured } from "./settings.js";
import { computeDailyDiscipline, computeStreak, localDateKey } from "./discipline.js";

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

let allTrades = [];
let userSettings = null;
let userId = null;
let currentPeriod = "all";

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

function renderStats(metrics) {
  const grid = document.getElementById("stat-grid");
  const winRate = metrics.winRate == null ? "—" : `${(metrics.winRate * 100).toFixed(0)}%`;
  const rr = metrics.avgRR == null ? "—" : `${metrics.avgRR.toFixed(2)}R`;
  const expectancy = metrics.expectancy == null ? "—" : formatCurrency(metrics.expectancy);
  const pnlDirection = metrics.totalPnl >= 0 ? "up" : "down";

  grid.innerHTML = [
    statTile("Resultado total", formatCurrency(metrics.totalPnl), { direction: pnlDirection }),
    statTile("Taxa de acerto", winRate, { delta: `${metrics.closedCount} trades fechados` }),
    statTile("Risco/retorno médio", rr),
    statTile("Expectância por trade", expectancy),
    statTile("Drawdown máximo", formatCurrency(metrics.maxDrawdown), {
      delta: metrics.maxDrawdownPercent ? `${metrics.maxDrawdownPercent.toFixed(1)}% do pico` : null,
      direction: metrics.maxDrawdown > 0 ? "down" : "",
    }),
  ].join("");
}

function renderAlerts(alerts) {
  const el = document.getElementById("pattern-alerts");
  if (!alerts.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = alerts
    .map(
      (a) => `
      <div class="alert ${a.severity}">
        <span class="alert-icon">${a.severity === "critical" ? "🚨" : "⚠️"}</span>
        <div>
          <strong>${a.title}</strong>
          ${a.description}
        </div>
      </div>`
    )
    .join("");
}

function renderRecentTrades(trades) {
  const el = document.getElementById("recent-trades");
  const closed = trades
    .filter((t) => t.exit_price != null)
    .sort((a, b) => new Date(b.exit_at) - new Date(a.exit_at))
    .slice(0, 8);

  if (!closed.length) {
    el.innerHTML = '<div class="empty-state">Nenhum trade fechado nesse período. <a href="trades.html">Registre um trade</a>.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Data</th><th>Ativo</th><th>Lado</th><th>Resultado</th><th>Emoção antes</th><th>Emoção depois</th>
        </tr>
      </thead>
      <tbody>
        ${closed
          .map((t) => {
            const p = pnl(t);
            return `
            <tr>
              <td>${new Date(t.exit_at).toLocaleDateString("pt-BR")}</td>
              <td>${t.asset}</td>
              <td>${t.side}</td>
              <td><span class="pill ${p >= 0 ? "win" : "loss"}">${formatCurrency(p)}</span></td>
              <td class="emoji-emotion" title="${emotionLabel(t.emotion_before)}">${emotionEmoji(t.emotion_before)} ${emotionLabel(t.emotion_before)}</td>
              <td class="emoji-emotion" title="${emotionLabel(t.emotion_after)}">${emotionEmoji(t.emotion_after)} ${emotionLabel(t.emotion_after)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    </div>`;
}

// ---------- Período ----------
function filterByPeriod(trades, period) {
  if (period === "all") return trades;
  const now = new Date();
  if (period === "today") {
    const todayKey = localDateKey(now);
    return trades.filter((t) => localDateKey(t.entry_at) === todayKey);
  }
  const days = period === "7d" ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return trades.filter((t) => new Date(t.entry_at) >= cutoff);
}

function renderPerformanceSection() {
  const filtered = filterByPeriod(allTrades, currentPeriod);
  const metrics = computeMetrics(filtered);
  renderStats(metrics);
  renderRecentTrades(filtered);
  renderEquityCurve(document.getElementById("equity-chart"), metrics.equityCurve);
  renderPerformanceBars(document.getElementById("asset-chart"), performanceByAsset(filtered));
  renderPerformanceBars(
    document.getElementById("weekday-chart"),
    performanceByWeekday(filtered).filter((d) => d.count > 0)
  );
}

function setupPeriodSelector() {
  const wrap = document.getElementById("period-selector");
  wrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPeriod = btn.dataset.period;
      wrap.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      renderPerformanceSection();
    });
  });
}

// ---------- Disciplina ----------
function scoreClass(score, threshold) {
  if (score >= threshold) return "good";
  if (score >= threshold - 20) return "warning";
  return "critical";
}

function formatDateLabel(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

function settingsFormHtml(settings) {
  return `
    <form id="discipline-settings-form" style="margin-top: 16px">
      <div class="form-grid">
        <div class="field">
          <label for="settings-max-position">Tamanho máx. de posição (R$)</label>
          <input type="number" id="settings-max-position" min="0" step="any" value="${settings.max_position_size ?? ""}" placeholder="Ex: 5000" />
        </div>
        <div class="field">
          <label for="settings-start-time">Horário permitido — início</label>
          <input type="time" id="settings-start-time" value="${settings.trading_start_time ?? ""}" />
        </div>
        <div class="field">
          <label for="settings-end-time">Horário permitido — fim</label>
          <input type="time" id="settings-end-time" value="${settings.trading_end_time ?? ""}" />
        </div>
        <div class="field">
          <label for="settings-threshold">Score mínimo pro streak (%)</label>
          <input type="number" id="settings-threshold" min="0" max="100" step="1" value="${settings.discipline_threshold ?? 80}" />
        </div>
      </div>
      <p class="hint" style="margin-top: 10px">
        Deixe um campo em branco pra não avaliar essa regra. Ex: se não preencher tamanho máximo
        de posição, o score não considera isso.
      </p>
      <div class="form-actions">
        <button type="button" class="btn" id="discipline-cancel-btn" style="display: none">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar regras</button>
      </div>
      <p class="error-text" id="discipline-settings-error" style="display: none"></p>
    </form>`;
}

function wireSettingsForm(showCancel) {
  const form = document.getElementById("discipline-settings-form");
  const cancelBtn = document.getElementById("discipline-cancel-btn");
  if (showCancel) {
    cancelBtn.style.display = "inline-block";
    cancelBtn.addEventListener("click", () => renderDisciplineCard());
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("discipline-settings-error");
    errorEl.style.display = "none";

    const val = (id) => document.getElementById(id).value;
    const settings = {
      max_position_size: val("settings-max-position") === "" ? null : Number(val("settings-max-position")),
      trading_start_time: val("settings-start-time") || null,
      trading_end_time: val("settings-end-time") || null,
      discipline_threshold: val("settings-threshold") === "" ? 80 : Number(val("settings-threshold")),
    };

    try {
      await saveUserSettings(userId, settings);
      userSettings = { ...userSettings, ...settings };
      renderDisciplineCard();
    } catch (err) {
      errorEl.textContent = err.message || "Não foi possível salvar as regras.";
      errorEl.style.display = "block";
    }
  });
}

function renderDisciplineCard() {
  const card = document.getElementById("discipline-card");

  if (!hasAnyRuleConfigured(userSettings)) {
    card.innerHTML = `
      <h2>Configure suas regras de disciplina</h2>
      <p class="hint">
        O score de disciplina é o número central deste app — mais importante que o resultado
        financeiro. Defina pelo menos uma regra pra começar a acompanhar (tamanho máximo de
        posição e/ou horário permitido de operação).
      </p>
      ${settingsFormHtml(userSettings)}`;
    wireSettingsForm(false);
    return;
  }

  const closedTrades = allTrades.filter((t) => t.exit_price != null);
  const dailyDiscipline = computeDailyDiscipline(closedTrades, userSettings);

  if (!dailyDiscipline.length) {
    card.innerHTML = `
      <h2>Score de disciplina</h2>
      <p class="hint">Nenhum trade fechado ainda se encaixa nas suas regras. Registre e feche trades para começar a pontuar.</p>
      <button class="btn" id="discipline-edit-btn">Editar regras</button>
      <div id="discipline-settings-form-wrap" style="display: none"></div>`;
    document.getElementById("discipline-edit-btn").addEventListener("click", () => {
      document.getElementById("discipline-settings-form-wrap").innerHTML = settingsFormHtml(userSettings);
      document.getElementById("discipline-settings-form-wrap").style.display = "block";
      wireSettingsForm(true);
    });
    return;
  }

  const today = dailyDiscipline[0];
  const isToday = today.date === localDateKey(new Date());
  const { count: streak } = computeStreak(dailyDiscipline, userSettings.discipline_threshold);

  card.innerHTML = `
    <div class="discipline-grid">
      <div>
        <div class="stat-label">Score de disciplina ${isToday ? "(hoje)" : `(${formatDateLabel(today.date)})`}</div>
        <div class="hero-figure ${scoreClass(today.score, userSettings.discipline_threshold)}">${today.score}</div>
        <div class="hint">${today.passed}/${today.applicable} regras cumpridas</div>
      </div>
      <div>
        <div class="stat-label">Streak de disciplina</div>
        <div class="hero-figure">🔥 ${streak}</div>
        <div class="hint">dias com trade e score ≥ ${userSettings.discipline_threshold}%</div>
      </div>
      <button class="btn" id="discipline-edit-btn">Editar regras</button>
    </div>
    <div id="discipline-settings-form-wrap" style="display: none"></div>`;

  document.getElementById("discipline-edit-btn").addEventListener("click", () => {
    const wrap = document.getElementById("discipline-settings-form-wrap");
    wrap.innerHTML = settingsFormHtml(userSettings);
    wrap.style.display = "block";
    wireSettingsForm(true);
    wrap.scrollIntoView({ behavior: "smooth" });
  });
}

async function main() {
  if (!isConfigured) {
    banner.className = "config-banner";
    banner.textContent =
      "Configure js/config.js com a URL e a chave anon do seu projeto Supabase para carregar seus dados.";
    renderStats(computeMetrics([]));
    renderAlerts([]);
    renderRecentTrades([]);
    renderEquityCurve(document.getElementById("equity-chart"), []);
    renderPerformanceBars(document.getElementById("asset-chart"), []);
    renderPerformanceBars(document.getElementById("weekday-chart"), []);
    setupPeriodSelector();
    return;
  }

  const session = await requireSession();
  if (!session) return;
  userId = session.user.id;

  const [{ data: trades, error }, settings] = await Promise.all([
    supabase.from("trades").select("*").order("entry_at", { ascending: false }),
    getUserSettings(),
  ]);

  if (error) {
    document.querySelector(".container").innerHTML = `<p class="error-text">Erro ao carregar trades: ${error.message}</p>`;
    return;
  }

  allTrades = trades;
  userSettings = settings;

  renderDisciplineCard();
  renderAlerts(detectPatterns(allTrades));
  setupPeriodSelector();
  renderPerformanceSection();
}

main();
