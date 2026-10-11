import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { DayPnl, EquityPoint, GroupRow } from "../types";
import { fmtCompact, fmtMoney, fmtPct, fmtSigned, monthMatrix } from "../utils";
import { pnlClass } from "./ui";

const tooltipStyle = {
  backgroundColor: "#13203a",
  border: "1px solid #26395f",
  borderRadius: 8,
  fontSize: 12,
  color: "#e9f0fc",
  boxShadow: "0 12px 32px rgba(0,0,0,.45)",
};

function EqTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: EquityPoint }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <div className="mb-1 font-mono text-[10.5px] text-fog">{p.date}</div>
      <div className="font-mono text-[13px] font-semibold text-snow tnum">{fmtMoney(p.equity, currency)}</div>
      <div className={`font-mono text-[11px] ${p.dd < 0 ? "text-dn" : "text-fog"} tnum`}>dd {p.dd.toFixed(1)}%</div>
    </div>
  );
}

export function EquityChart({ points, starting, currency }: { points: EquityPoint[]; starting: number; currency: string }) {
  const data = useMemo(() => [{ i: 0, date: "start", equity: starting, dd: 0 }, ...points], [points, starting]);
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, right: 6, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id="gEq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ddc97" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#3ddc97" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1b2a47" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#5c7099", fontSize: 10.5, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={{ stroke: "#1b2a47" }}
            minTickGap={52}
            tickFormatter={(d: string) => (d === "start" ? "" : d.slice(5))}
          />
          <YAxis
            yAxisId="eq"
            orientation="right"
            width={62}
            tick={{ fill: "#5c7099", fontSize: 10.5, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => fmtCompact(v, currency).replace("$", "$")}
            domain={["auto", "auto"]}
          />
          <YAxis yAxisId="dd" hide domain={[-20, 0]} />
          <Tooltip content={<EqTooltip currency={currency} />} cursor={{ stroke: "#26395f" }} />
          <ReferenceLine yAxisId="eq" y={starting} stroke="#26395f" strokeDasharray="4 4" />
          <Area
            yAxisId="eq"
            type="monotone"
            dataKey="equity"
            stroke="#3ddc97"
            strokeWidth={2}
            fill="url(#gEq)"
            animationDuration={900}
            dot={false}
            activeDot={{ r: 4, fill: "#3ddc97", stroke: "#0e1728" }}
          />
          <Line yAxisId="dd" type="monotone" dataKey="dd" stroke="#ff6472" strokeWidth={1.2} strokeOpacity={0.55} dot={false} animationDuration={900} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DayTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: DayPnl }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <div className="mb-1 font-mono text-[10.5px] text-fog">{d.date}</div>
      <div className={`font-mono text-[13px] font-semibold tnum ${pnlClass(d.pnl)}`}>{fmtSigned(d.pnl, currency)}</div>
      <div className="text-[11px] text-fog">{d.count} trade{d.count === 1 ? "" : "s"}</div>
    </div>
  );
}

export function DailyBars({ days, currency }: { days: DayPnl[]; currency: string }) {
  const data = days.slice(-24);
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="#1b2a47" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#5c7099", fontSize: 9.5, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={{ stroke: "#1b2a47" }}
            minTickGap={34}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            orientation="right"
            width={54}
            tick={{ fill: "#5c7099", fontSize: 10, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => fmtCompact(v, currency)}
          />
          <Tooltip content={<DayTooltip currency={currency} />} cursor={{ fill: "rgba(90,162,255,0.06)" }} />
          <ReferenceLine y={0} stroke="#26395f" />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]} animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.date} fill={d.pnl >= 0 ? "#3ddc97" : "#ff6472"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- custom horizontal bars ---------------- */

export function HBarList({ rows, currency, suffix }: { rows: GroupRow[]; currency: string; suffix?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[12.5px] font-medium text-snow">{r.label}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-dim tnum">{r.count}×</span>
              <span className="shrink-0 font-mono text-[10.5px] text-fog tnum">{fmtPct(r.winRate, 0)} win</span>
              {r.avgR != null && <span className={`shrink-0 font-mono text-[10.5px] tnum ${pnlClass(r.avgR)}`}>{r.avgR > 0 ? "+" : ""}{r.avgR.toFixed(2)}R</span>}
            </div>
            <span className={`shrink-0 font-mono text-[12px] font-semibold tnum ${pnlClass(r.pnl)}`}>
              {fmtSigned(r.pnl, currency)}
              {suffix || ""}
            </span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-deep">
            <div
              className={`anim-grow-x h-full rounded-full ${r.pnl >= 0 ? "bg-up/75" : "bg-dn/75"} transition-all group-hover:brightness-125`}
              style={{ width: `${Math.max(3, (Math.abs(r.pnl) / max) * 100)}%`, animationDelay: `${i * 60}ms` }}
            />
          </div>
        </div>
      ))}
      {!rows.length && <p className="py-6 text-center text-xs text-dim">No data yet.</p>}
    </div>
  );
}

/* ---------------- custom vertical bars ---------------- */

export function VertBars({ rows, currency, label }: { rows: GroupRow[]; currency: string; label?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-[170px] items-end justify-between gap-2">
        {rows.map((r, i) => {
          const h = Math.max(4, (Math.abs(r.pnl) / max) * 148);
          const active = hover === r.key;
          return (
            <div
              key={r.key}
              className="group flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1.5"
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span className={`font-mono text-[10px] tnum transition-opacity ${active ? "opacity-100" : "opacity-0"} ${pnlClass(r.pnl)}`}>
                {fmtCompact(r.pnl, currency)}
              </span>
              <div
                className={`anim-grow-y w-full max-w-[46px] rounded-t-[4px] transition-all ${r.pnl >= 0 ? "bg-up/70" : "bg-dn/70"} ${active ? "brightness-125" : ""}`}
                style={{ height: h, animationDelay: `${i * 55}ms` }}
              />
              <span className="font-mono text-[10px] text-dim">{label ? r.key : r.label}</span>
              <span className={`-mt-1 font-mono text-[9.5px] tnum ${active ? "text-fog" : "text-dim/70"}`}>{fmtPct(r.winRate, 0)}</span>
            </div>
          );
        })}
      </div>
      {label && <p className="mt-3 text-center text-[10.5px] uppercase tracking-[0.14em] text-dim">{label}</p>}
    </div>
  );
}

/* ---------------- calendar heatmap ---------------- */

export function CalendarHeatmap({ daily, currency }: { daily: DayPnl[]; currency: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const weeks = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);
  const map = useMemo(() => new Map(daily.map((d) => [d.date, d])), [daily]);
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d.pnl)));

  const shift = (d: number) => {
    const dt = new Date(cursor.y, cursor.m + d, 1);
    setCursor({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  const cellBg = (iso: string): string => {
    const d = map.get(iso);
    if (!d) return "transparent";
    const a = 0.14 + 0.72 * Math.min(1, Math.abs(d.pnl) / maxAbs);
    return d.pnl >= 0 ? `rgba(61,220,151,${a.toFixed(2)})` : `rgba(255,100,114,${a.toFixed(2)})`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="rounded-md border border-edge p-1.5 text-fog transition-colors hover:border-edge2 hover:text-snow" aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <span className="font-display text-[13px] font-semibold text-snow">
          {format(new Date(cursor.y, cursor.m, 1), "MMMM yyyy")}
        </span>
        <button onClick={() => shift(1)} className="rounded-md border border-edge p-1.5 text-fog transition-colors hover:border-edge2 hover:text-snow" aria-label="Next month">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-1 font-mono text-[10px] text-dim">
            {d}
          </div>
        ))}
        {weeks.flat().map((iso, i) => {
          if (!iso) return <div key={`x${i}`} />;
          const d = map.get(iso);
          return (
            <div
              key={iso}
              title={d ? `${iso} · ${fmtSigned(d.pnl, currency)} · ${d.count} trade${d.count === 1 ? "" : "s"}` : iso}
              className={`flex h-9 items-center justify-center rounded-[5px] border font-mono text-[10.5px] transition-transform hover:scale-110 tnum ${
                d ? "border-transparent text-snow" : "border-edge/50 text-dim"
              }`}
              style={{ backgroundColor: cellBg(iso) }}
            >
              {Number(iso.slice(8))}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3 font-mono text-[10px] text-dim">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-dn/70" /> loss</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-raise" /> flat</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-up/70" /> gain</span>
      </div>
    </div>
  );
}
