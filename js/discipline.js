// Score de disciplina (0-100) e streak — o número central do app, não o P&L.
//
// Três regras fixas, cada uma só "conta" (é aplicável) se o dado necessário
// pra avaliá-la existir. Um trade sem stop_loss definido, por exemplo, não
// pune nem beneficia o score — simplesmente não entra na conta pra essa regra.

function pad(n) {
  return String(n).padStart(2, "0");
}

export function localDateKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// Regra 1: se definiu um stop loss, o preço de saída não pode ter passado dele.
function stopLossRespected(trade) {
  if (trade.stop_loss == null || trade.exit_price == null) return null;
  if (trade.side === "compra") return trade.exit_price >= trade.stop_loss;
  return trade.exit_price <= trade.stop_loss;
}

// Regra 2: valor da posição não pode passar do limite configurado.
function positionSizeOk(trade, maxPositionSize) {
  if (maxPositionSize == null) return null;
  return trade.entry_price * trade.quantity <= maxPositionSize;
}

// Regra 3: entrada dentro da janela de horário permitida (aceita janela
// que vira a virada do dia, ex: 22:00–02:00).
function withinTradingHours(trade, startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null) return null;

  const entry = new Date(trade.entry_at);
  const entryMinutes = entry.getHours() * 60 + entry.getMinutes();

  if (start <= end) return entryMinutes >= start && entryMinutes <= end;
  return entryMinutes >= start || entryMinutes <= end;
}

export function evaluateTrade(trade, settings) {
  const checks = [
    { rule: "stop_loss", passed: stopLossRespected(trade) },
    { rule: "position_size", passed: positionSizeOk(trade, settings.max_position_size) },
    { rule: "trading_hours", passed: withinTradingHours(trade, settings.trading_start_time, settings.trading_end_time) },
  ].filter((c) => c.passed != null);

  return {
    applicable: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

// Um score por dia (só para dias com pelo menos 1 trade fechado e pelo menos
// 1 regra aplicável), mais recente primeiro.
export function computeDailyDiscipline(trades, settings) {
  const closed = trades.filter((t) => t.exit_price != null);
  const byDay = new Map();

  for (const trade of closed) {
    const key = localDateKey(trade.entry_at);
    const { applicable, passed } = evaluateTrade(trade, settings);
    if (applicable === 0) continue;

    const day = byDay.get(key) || { date: key, applicable: 0, passed: 0 };
    day.applicable += applicable;
    day.passed += passed;
    byDay.set(key, day);
  }

  return [...byDay.values()]
    .map((d) => ({ ...d, score: Math.round((d.passed / d.applicable) * 100) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Dias consecutivos (só contando dias em que houve trade) com score >= limiar,
// andando do mais recente pra trás. Um dia sem trade nenhum não quebra nem
// soma — simplesmente não existe na lista de entrada.
export function computeStreak(dailyDiscipline, threshold) {
  let count = 0;
  for (const day of dailyDiscipline) {
    if (day.score >= threshold) count++;
    else break;
  }
  return { count, lastDate: dailyDiscipline[0]?.date || null };
}
