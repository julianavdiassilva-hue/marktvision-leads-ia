"use client";
/**
 * Gráficos simples e acessíveis (uma série por gráfico, cor da marca validada contra o fundo).
 * Barras <= 24px, extremidade arredondada de 4px, grade discreta, dica ao passar o mouse.
 */
import { useState } from "react";

const BRAND = "var(--color-brand)";

type Tip = { x: number; y: number; text: string } | null;

/** Colunas por dia (pequenos múltiplos: um gráfico por indicador, nunca dois eixos). */
type Fmt = "int" | "money";
const fmtOf = (k: Fmt = "int") => (n: number) => k === "money" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) : new Intl.NumberFormat("pt-BR").format(n);

export function ColumnChart({ title, data, kind, height = 150 }: {
  title: string; data: { label: string; value: number; full?: string }[]; kind?: Fmt; height?: number;
}) {
  const format = fmtOf(kind);
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const W = Math.max(320, data.length * 14);
  const slot = W / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, slot - 2));
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <figure className="relative">
      <figcaption className="mb-2 flex items-baseline justify-between"><span className="text-[15px] font-semibold">{title}</span><span className="text-[14px] text-muted tabular-nums">Total: {format(total)}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${height + 22}`} className="w-full" role="img" aria-label={`${title}: total ${format(total)}`} onMouseLeave={() => setTip(null)}>
        {[0.5, 1].map((g) => <line key={g} x1={0} x2={W} y1={height - height * g * 0.92} y2={height - height * g * 0.92} stroke="var(--color-line)" strokeWidth={1} />)}
        <line x1={0} x2={W} y1={height} y2={height} stroke="var(--color-line)" strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.value / max) * height * 0.92;
          const x = i * slot + (slot - bw) / 2;
          return (
            <g key={i} onMouseEnter={() => setTip({ x: ((i + 0.5) * slot) / W, y: 1 - h / (height + 22), text: `${d.full ?? d.label}: ${format(d.value)}` })}>
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {d.value > 0 && <path d={`M${x},${height} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(0, h - 4)} z`} fill={BRAND} />}
              {i % labelEvery === 0 && <text x={i * slot + slot / 2} y={height + 16} textAnchor={i === 0 ? "start" : i >= data.length - labelEvery ? "end" : "middle"} fontSize={11} fill="var(--color-muted)">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {tip && <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-[12.5px] font-medium text-white shadow"
        style={{ left: `${tip.x * 100}%`, top: `calc(${tip.y * 100}% + 24px)` }}>{tip.text}</div>}
    </figure>
  );
}

/** Barras horizontais (funil, ranking). Valor em texto ao lado; a barra só dá a proporção. */
export function HBarChart({ data, kind }: {
  data: { label: string; value: number; extra?: string; note?: string | null }[]; kind?: Fmt;
}) {
  const format = fmtOf(kind);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5" role="list">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-[14.5px]" title={`${d.label}: ${format(d.value)}${d.extra ? ` · ${d.extra}` : ""}`}>
          <span className="truncate text-ink">{d.label}</span>
          <span className="h-[18px] rounded-r bg-surface"><span className="block h-full rounded-r-[4px]" style={{ width: `${(d.value / max) * 100}%`, background: BRAND, minWidth: d.value ? 3 : 0 }} /></span>
          <span className="min-w-[90px] text-right font-semibold tabular-nums text-ink">{format(d.value)}{d.note ? <span className="ml-1.5 text-[12.5px] font-normal text-muted">{d.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
