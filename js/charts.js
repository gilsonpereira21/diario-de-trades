// Gráficos SVG desenhados à mão, seguindo as specs do skill de dataviz:
// linha 2px, marcador >=8px com anel de superfície, área a 10% de opacidade,
// barras com ponta arredondada de 4px e esquadro na base, gridlines hairline.

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatCurrency(v) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(v);
  return ticks;
}

function ensureTooltip(wrap) {
  let tip = wrap.querySelector(".svg-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "svg-tooltip";
    wrap.appendChild(tip);
  }
  return tip;
}

function showTooltip(wrap, tip, x, y, html) {
  tip.innerHTML = html;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.opacity = "1";
}

function hideTooltip(tip) {
  tip.style.opacity = "0";
}

// ---------- Curva de patrimônio (linha) ----------
export function renderEquityCurve(container, points) {
  container.innerHTML = "";
  if (!points.length) {
    container.innerHTML = '<div class="empty-state">Sem trades fechados ainda para desenhar a curva.</div>';
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  container.appendChild(wrap);

  const width = 640;
  const height = 220;
  const margin = { top: 12, right: 16, bottom: 24, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const xFor = (i) => margin.left + (i / (points.length - 1 || 1)) * innerW;
  const yFor = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: "auto",
    role: "img",
    "aria-label": "Curva de patrimônio acumulado",
  });

  const grid = cssVar("--grid");
  const baseline = cssVar("--baseline");
  const seriesColor = cssVar("--series-1");
  const surface = cssVar("--surface-1");

  // gridlines + y labels
  for (const t of ticks) {
    const y = yFor(t);
    svg.appendChild(
      svgEl("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        stroke: t === 0 ? baseline : grid,
        "stroke-width": 1,
      })
    );
    const label = svgEl("text", {
      x: margin.left - 8,
      y: y + 4,
      "text-anchor": "end",
      "font-size": 11,
      fill: cssVar("--text-muted"),
    });
    label.textContent = formatCurrency(t).replace("R$", "").trim();
    svg.appendChild(label);
  }

  // area fill
  const areaPath = [`M ${xFor(0)} ${yFor(0)}`];
  points.forEach((p, i) => areaPath.push(`L ${xFor(i)} ${yFor(p.value)}`));
  areaPath.push(`L ${xFor(points.length - 1)} ${yFor(0)} Z`);
  svg.appendChild(
    svgEl("path", { d: areaPath.join(" "), fill: seriesColor, opacity: 0.1 })
  );

  // line
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.value)}`)
    .join(" ");
  svg.appendChild(
    svgEl("path", {
      d: linePath,
      fill: "none",
      stroke: seriesColor,
      "stroke-width": 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  // end marker
  const last = points[points.length - 1];
  svg.appendChild(
    svgEl("circle", {
      cx: xFor(points.length - 1),
      cy: yFor(last.value),
      r: 5,
      fill: seriesColor,
      stroke: surface,
      "stroke-width": 2,
    })
  );

  // hover targets
  const tip = ensureTooltip(wrap);
  points.forEach((p, i) => {
    const hit = svgEl("circle", {
      cx: xFor(i),
      cy: yFor(p.value),
      r: 10,
      fill: "transparent",
    });
    hit.addEventListener("mouseenter", (e) => {
      const rect = wrap.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / width;
      showTooltip(
        wrap,
        tip,
        xFor(i) * scale,
        yFor(p.value) * scale,
        `<strong>${new Date(p.date).toLocaleDateString("pt-BR")}</strong><br>${formatCurrency(p.value)}`
      );
    });
    hit.addEventListener("mouseleave", () => hideTooltip(tip));
    svg.appendChild(hit);
  });

  wrap.appendChild(svg);
}

// ---------- Barras divergentes (ganho/perda por categoria) ----------
function roundedBarPath(x, w, baselineY, endY, radius) {
  const goingUp = endY < baselineY;
  const r = Math.min(radius, Math.abs(baselineY - endY), w / 2);
  if (r <= 0) {
    return `M ${x} ${baselineY} L ${x} ${endY} L ${x + w} ${endY} L ${x + w} ${baselineY} Z`;
  }
  if (goingUp) {
    return `M ${x} ${baselineY}
      L ${x} ${endY + r}
      Q ${x} ${endY} ${x + r} ${endY}
      L ${x + w - r} ${endY}
      Q ${x + w} ${endY} ${x + w} ${endY + r}
      L ${x + w} ${baselineY} Z`;
  }
  return `M ${x} ${baselineY}
    L ${x} ${endY - r}
    Q ${x} ${endY} ${x + r} ${endY}
    L ${x + w - r} ${endY}
    Q ${x + w} ${endY} ${x + w} ${endY - r}
    L ${x + w} ${baselineY} Z`;
}

export function renderPerformanceBars(container, data) {
  container.innerHTML = "";
  if (!data.length) {
    container.innerHTML = '<div class="empty-state">Sem dados suficientes ainda.</div>';
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  container.appendChild(wrap);

  const width = 640;
  const height = 220;
  const margin = { top: 12, right: 16, bottom: 28, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const values = data.map((d) => d.total);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const yFor = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const baselineY = yFor(0);

  const slot = innerW / data.length;
  const barW = Math.min(28, slot * 0.55);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: "auto",
    role: "img",
    "aria-label": "Desempenho por categoria",
  });

  const grid = cssVar("--grid");
  const baseline = cssVar("--baseline");
  const good = cssVar("--good");
  const critical = cssVar("--critical");
  const muted = cssVar("--text-muted");

  for (const t of ticks) {
    const y = yFor(t);
    svg.appendChild(
      svgEl("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        stroke: t === 0 ? baseline : grid,
        "stroke-width": 1,
      })
    );
  }

  const tip = ensureTooltip(wrap);

  data.forEach((d, i) => {
    const x = margin.left + i * slot + (slot - barW) / 2;
    const endY = yFor(d.total);
    const color = d.total >= 0 ? good : critical;

    const bar = svgEl("path", {
      d: roundedBarPath(x, barW, baselineY, endY, 4),
      fill: color,
    });
    svg.appendChild(bar);

    const hit = svgEl("rect", {
      x: margin.left + i * slot,
      y: margin.top,
      width: slot,
      height: innerH,
      fill: "transparent",
    });
    hit.addEventListener("mouseenter", () => {
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / width;
      showTooltip(
        wrap,
        tip,
        (x + barW / 2) * scale,
        endY * scale,
        `<strong>${d.label}</strong><br>${formatCurrency(d.total)} · ${d.count} trade${d.count === 1 ? "" : "s"}`
      );
    });
    hit.addEventListener("mouseleave", () => hideTooltip(tip));
    svg.appendChild(hit);

    const label = svgEl("text", {
      x: x + barW / 2,
      y: height - margin.bottom + 16,
      "text-anchor": "middle",
      "font-size": 11,
      fill: muted,
    });
    label.textContent = d.label;
    svg.appendChild(label);
  });

  wrap.appendChild(svg);
}
