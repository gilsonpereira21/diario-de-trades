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

const banner = document.getElementById("config-banner");
document.getElementById("logout-btn").addEventListener("click", signOut);
initMobileNav();

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
    el.innerHTML = '<div class="empty-state">Nenhum trade fechado ainda. <a href="trades.html">Registre seu primeiro trade</a>.</div>';
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
    return;
  }

  const session = await requireSession();
  if (!session) return;

  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .order("entry_at", { ascending: false });

  if (error) {
    document.querySelector(".container").innerHTML = `<p class="error-text">Erro ao carregar trades: ${error.message}</p>`;
    return;
  }

  const metrics = computeMetrics(trades);
  renderStats(metrics);
  renderAlerts(detectPatterns(trades));
  renderRecentTrades(trades);
  renderEquityCurve(document.getElementById("equity-chart"), metrics.equityCurve);
  renderPerformanceBars(document.getElementById("asset-chart"), performanceByAsset(trades));
  renderPerformanceBars(document.getElementById("weekday-chart"), performanceByWeekday(trades).filter((d) => d.count > 0));
}

main();
