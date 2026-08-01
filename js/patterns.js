import { closedTrades, pnl } from "./metrics.js";

const MIN_SAMPLES = 3;
const GAP_THRESHOLD = 0.15; // 15 pontos percentuais

function sortByExit(trades) {
  return [...trades].sort((a, b) => new Date(a.exit_at) - new Date(b.exit_at));
}

function winRateOf(trades) {
  if (!trades.length) return null;
  const wins = trades.filter((t) => pnl(t) > 0).length;
  return wins / trades.length;
}

// "Você perde mais depois de 2 trades seguidos no vermelho"
function detectRevengePattern(sorted) {
  const overall = winRateOf(sorted);
  if (overall == null) return null;

  const following = [];
  for (let i = 2; i < sorted.length; i++) {
    const prevTwoAreLosses =
      pnl(sorted[i - 1]) < 0 && pnl(sorted[i - 2]) < 0;
    if (prevTwoAreLosses) following.push(sorted[i]);
  }

  if (following.length < MIN_SAMPLES) return null;

  const conditionalWinRate = winRateOf(following);
  const gap = overall - conditionalWinRate;

  if (gap >= GAP_THRESHOLD) {
    return {
      id: "revenge-trading",
      severity: gap >= 0.3 ? "critical" : "warning",
      title: "Padrão de revenge trading detectado",
      description: `Sua taxa de acerto cai de ${pct(overall)} para ${pct(
        conditionalWinRate
      )} nos trades feitos logo após 2 perdas seguidas (${
        following.length
      } ocorrências analisadas). Considere pausar após perdas consecutivas.`,
    };
  }
  return null;
}

// Win rate por estado emocional antes do trade.
function detectEmotionPattern(sorted) {
  const overall = winRateOf(sorted);
  if (overall == null) return [];

  const groups = new Map();
  for (const t of sorted) {
    if (!t.emotion_before) continue;
    if (!groups.has(t.emotion_before)) groups.set(t.emotion_before, []);
    groups.get(t.emotion_before).push(t);
  }

  const alerts = [];
  for (const [emotion, ts] of groups.entries()) {
    if (ts.length < MIN_SAMPLES) continue;
    const wr = winRateOf(ts);
    const gap = overall - wr;
    if (gap >= GAP_THRESHOLD) {
      alerts.push({
        id: `emotion-${emotion}`,
        severity: gap >= 0.3 ? "critical" : "warning",
        title: `Desempenho pior quando você está "${emotion}"`,
        description: `Taxa de acerto de ${pct(
          wr
        )} nos ${ts.length} trades registrados com esse estado emocional, contra ${pct(
          overall
        )} na média geral.`,
      });
    }
  }
  return alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1));
}

// Trades que ultrapassam significativamente o tamanho médio de posição — sinal de tilt.
function detectOversizedAfterLoss(sorted) {
  if (sorted.length < MIN_SAMPLES + 1) return null;

  const sizes = sorted.map((t) => t.entry_price * t.quantity);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  const offenders = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevWasLoss = pnl(sorted[i - 1]) < 0;
    const size = sorted[i].entry_price * sorted[i].quantity;
    if (prevWasLoss && size > avgSize * 1.5) offenders.push(sorted[i]);
  }

  if (offenders.length < MIN_SAMPLES) return null;

  return {
    id: "oversized-after-loss",
    severity: "warning",
    title: "Aumento de posição após perdas",
    description: `Em ${offenders.length} trades, o tamanho da posição ficou 50%+ acima da sua média logo após uma perda — um sinal comum de tentativa de "recuperar rápido".`,
  };
}

export function detectPatterns(trades) {
  const sorted = sortByExit(closedTrades(trades));
  const alerts = [];

  const revenge = detectRevengePattern(sorted);
  if (revenge) alerts.push(revenge);

  alerts.push(...detectEmotionPattern(sorted));

  const oversized = detectOversizedAfterLoss(sorted);
  if (oversized) alerts.push(oversized);

  return alerts;
}

function pct(x) {
  return `${(x * 100).toFixed(0)}%`;
}
