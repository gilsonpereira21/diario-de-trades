// Cálculos puros sobre uma lista de trades (sem I/O).
// Trade: { id, asset, side: 'compra'|'venda', quantity, entry_price, exit_price,
//          stop_loss, take_profit, entry_at, exit_at, emotion_before, emotion_after }

export function pnl(trade) {
  if (trade.exit_price == null) return null;
  const diff =
    trade.side === "venda"
      ? trade.entry_price - trade.exit_price
      : trade.exit_price - trade.entry_price;
  return diff * trade.quantity;
}

export function pnlPercent(trade) {
  const p = pnl(trade);
  if (p == null) return null;
  const base = trade.entry_price * trade.quantity;
  return base === 0 ? null : (p / base) * 100;
}

export function riskAmount(trade) {
  if (trade.stop_loss == null) return null;
  return Math.abs(trade.entry_price - trade.stop_loss) * trade.quantity;
}

// Múltiplo R: quanto o trade rendeu em relação ao risco assumido (stop loss).
export function rMultiple(trade) {
  const p = pnl(trade);
  const risk = riskAmount(trade);
  if (p == null || risk == null || risk === 0) return null;
  return p / risk;
}

export function closedTrades(trades) {
  return trades.filter((t) => t.exit_price != null);
}

export function computeMetrics(trades) {
  const closed = closedTrades(trades);
  const results = closed.map(pnl);
  const wins = results.filter((p) => p > 0);
  const losses = results.filter((p) => p < 0);

  const totalPnl = results.reduce((a, b) => a + b, 0);
  const winRate = closed.length ? wins.length / closed.length : null;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length)
    : 0;

  const rMultiples = closed.map(rMultiple).filter((r) => r != null);
  const avgRR = rMultiples.length
    ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length
    : avgLoss > 0
    ? avgWin / avgLoss
    : null;

  const lossRate = winRate == null ? null : 1 - winRate;
  const expectancy =
    winRate == null ? null : winRate * avgWin - lossRate * avgLoss;

  const { maxDrawdown, maxDrawdownPercent, curve } = equityCurve(closed);

  return {
    totalTrades: trades.length,
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    winRate,
    avgWin,
    avgLoss,
    avgRR,
    expectancy,
    totalPnl,
    maxDrawdown,
    maxDrawdownPercent,
    equityCurve: curve,
  };
}

// Curva de patrimônio (PnL acumulado) ordenada por data de saída + máximo drawdown.
export function equityCurve(closed) {
  const sorted = [...closed].sort(
    (a, b) => new Date(a.exit_at) - new Date(b.exit_at)
  );

  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  const curve = [];

  for (const t of sorted) {
    cum += pnl(t);
    peak = Math.max(peak, cum);
    const dd = peak - cum;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = peak > 0 ? (dd / peak) * 100 : 0;
    }
    curve.push({ date: t.exit_at, value: cum, asset: t.asset });
  }

  return { curve, maxDrawdown, maxDrawdownPercent };
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function performanceByAsset(trades) {
  const closed = closedTrades(trades);
  const groups = groupBy(closed, (t) => t.asset);
  return [...groups.entries()]
    .map(([asset, ts]) => ({
      label: asset,
      total: ts.reduce((sum, t) => sum + pnl(t), 0),
      count: ts.length,
    }))
    .sort((a, b) => b.total - a.total);
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function performanceByWeekday(trades) {
  const closed = closedTrades(trades);
  const groups = groupBy(closed, (t) => new Date(t.exit_at).getDay());
  return WEEKDAYS.map((label, idx) => {
    const ts = groups.get(idx) || [];
    return {
      label,
      total: ts.reduce((sum, t) => sum + pnl(t), 0),
      count: ts.length,
    };
  });
}

export function performanceByHour(trades) {
  const closed = closedTrades(trades);
  const groups = groupBy(closed, (t) => new Date(t.entry_at).getHours());
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const ts = groups.get(h) || [];
    if (ts.length === 0) continue;
    hours.push({
      label: `${String(h).padStart(2, "0")}h`,
      total: ts.reduce((sum, t) => sum + pnl(t), 0),
      count: ts.length,
    });
  }
  return hours;
}
