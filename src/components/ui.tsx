import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import type { AssetClass, Tone } from "../types";

/* ---------------- scroll reveal ---------------- */

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          ob.disconnect();
        }
      },
      { threshold: 0.06 }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------- animated number ---------------- */

function useCountUp(value: number, dur = 750): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (value - from) * e;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, dur]);
  return display;
}

export function Num({ value, format, className = "" }: { value: number; format: (n: number) => string; className?: string }) {
  const d = useCountUp(value);
  return <span className={`tnum ${className}`}>{format(d)}</span>;
}

/* ---------------- tone helpers ---------------- */

export const toneText: Record<Tone, string> = {
  up: "text-up",
  dn: "text-dn",
  gold: "text-gold",
  sky: "text-sky",
  fog: "text-fog",
};

export function pnlClass(n: number): string {
  return n > 0 ? "text-up" : n < 0 ? "text-dn" : "text-fog";
}

/* ---------------- badges ---------------- */

export function SideBadge({ side }: { side: "LONG" | "SHORT" }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${
        side === "LONG" ? "bg-up/12 text-up border border-up/25" : "bg-dn/12 text-dn border border-dn/25"
      }`}
    >
      {side}
    </span>
  );
}

export function AssetBadge({ ac }: { ac: AssetClass }) {
  const map: Record<AssetClass, { t: string; cls: string }> = {
    STOCK: { t: "EQ", cls: "border-edge2 bg-raise text-fog" },
    OPTION: { t: "OPT", cls: "border-gold/30 bg-gold/10 text-gold" },
    FUTURES: { t: "FUT", cls: "border-sky/30 bg-sky/10 text-sky" },
  };
  const m = map[ac] || map.STOCK;
  return (
    <span className={`inline-flex items-center rounded border px-1 py-0.5 font-mono text-[9px] font-semibold tracking-wider ${m.cls}`} title={`${ac} · point value applied in P&L`}>
      {m.t}
    </span>
  );
}

export function Tag({ children, tone = "fog" }: { children: ReactNode; tone?: Tone }) {
  const map: Record<Tone, string> = {
    up: "border-up/25 bg-up/10 text-up",
    dn: "border-dn/25 bg-dn/10 text-dn",
    gold: "border-gold/25 bg-gold/10 text-gold",
    sky: "border-sky/25 bg-sky/10 text-sky",
    fog: "border-edge2 bg-raise text-fog",
  };
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${map[tone]}`}>{children}</span>;
}

export function PlanMark({ v }: { v: boolean | null }) {
  if (v == null) return <span className="text-dim">—</span>;
  return v ? (
    <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-up/15 text-up" title="Followed plan">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5 5 9l4.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  ) : (
    <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-dn/15 text-dn" title="Broke plan">
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </span>
  );
}

/* ---------------- cards & stats ---------------- */

export function StatCard({
  label,
  value,
  sub,
  tone = "fog",
  icon,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="card group relative overflow-hidden px-4 py-3.5 transition-colors hover:border-edge2 hover:bg-raise/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-dim">{label}</span>
          {icon && <span className={`${toneText[tone]} opacity-60 transition-opacity group-hover:opacity-100`}>{icon}</span>}
        </div>
        <div className={`mt-1.5 font-display text-[22px] font-bold leading-tight ${toneText[tone]}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-fog">{sub}</div>}
      </div>
    </Reveal>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-snow">{children}</h2>
      {right}
    </div>
  );
}

/* ---------------- donut ---------------- */

export function Donut({ pct, size = 108, stroke = 10, color = "var(--color-sky)", label, sublabel }: { pct: number; size?: number; stroke?: number; color?: string; label: string; sublabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-edge)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="anim-dash"
          style={{ ["--dash" as string]: c, ["--dash-end" as string]: off }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold text-snow tnum">{label}</span>
        {sublabel && <span className="text-[10px] uppercase tracking-widest text-dim">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ---------------- segmented control ---------------- */

export function Seg<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-md border border-edge bg-deep p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] font-medium transition-all ${size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${
            value === o.value ? "bg-raise text-snow shadow-sm ring-1 ring-edge2" : "text-fog hover:text-snow"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- modal ---------------- */

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-abyss/78 p-4 pt-[7vh] backdrop-blur-[3px]" onMouseDown={onClose}>
      <div
        className={`anim-pop card w-full ${wide ? "max-w-3xl" : "max-w-lg"} border-edge2 bg-panel shadow-2xl shadow-black/50`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h3 className="font-display text-[15px] font-semibold text-snow">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-fog transition-colors hover:bg-raise hover:text-snow" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm leading-relaxed text-fog">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-edge px-3.5 py-2 text-xs font-medium text-fog transition-colors hover:border-edge2 hover:text-snow">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-md px-3.5 py-2 text-xs font-semibold text-abyss transition-transform active:scale-95 ${
            danger ? "bg-dn hover:brightness-110" : "bg-up hover:brightness-110"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- toast host ---------------- */

export function ToastHost() {
  const { toasts } = useStore();
  const bar: Record<string, string> = { up: "bg-up", dn: "bg-dn", sky: "bg-sky", gold: "bg-gold" };
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[300px] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="anim-toast card flex items-center gap-3 border-edge2 bg-raise/95 px-3.5 py-3 shadow-xl shadow-black/40">
          <span className={`h-8 w-1 shrink-0 rounded-full ${bar[t.tone]}`} />
          <span className="text-[12.5px] font-medium leading-snug text-snow">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- empty state ---------------- */

export function EmptyState({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="card anim-rise flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-edge bg-raise text-sky">{icon}</div>
      <h3 className="font-display text-lg font-semibold text-snow">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fog">{body}</p>
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">{children}</div>}
    </div>
  );
}

export function BtnPrimary({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-up px-3.5 py-2 text-xs font-semibold text-abyss transition-all hover:brightness-110 active:scale-95"
    >
      {children}
    </button>
  );
}

export function BtnGhost({ children, onClick, danger }: { children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium transition-all active:scale-95 ${
        danger ? "border-dn/35 text-dn hover:bg-dn/10" : "border-edge text-fog hover:border-edge2 hover:text-snow"
      }`}
    >
      {children}
    </button>
  );
}
