import { useMemo, useRef, useState } from "react";
import { Download, Filter, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useStore } from "../store";
import type { AssetClass, OptionType, Side, Trade } from "../types";
import {
  CSV_TEMPLATE,
  csvToTrades,
  download,
  fmtDateNice,
  fmtDateShort,
  fmtMoney,
  fmtPrice,
  fmtSigned,
  round2,
  sortTrades,
  todayISO,
  tradePnl,
  tradesToCSV,
  contractLabel,
  defaultMultiplier,
  FUTURES_MULTIPLIERS,
} from "../utils";
import { AssetBadge, BtnGhost, BtnPrimary, Confirm, Modal, PlanMark, Reveal, Seg, SideBadge, Tag, pnlClass } from "../components/ui";

const TAG_PRESETS = ["A+ setup", "Patient entry", "Textbook", "Scaled out", "Chased entry", "Moved stop", "Oversized", "Revenge trade", "Early exit", "News gamble", "Overtrading", "No setup"];
const EMO_PRESETS = ["Calm", "Confident", "Focused", "Anxious", "Greedy", "Frustrated", "FOMO", "Bored"];
const SETUP_PRESETS = ["Opening Range Breakout", "VWAP Fade", "Bull Flag", "Momentum Continuation", "Knife-Catch Reversal", "Gap & Go", "S/R Bounce"];

/* ================= Trade form modal ================= */

interface FormState {
  symbol: string;
  assetClass: AssetClass;
  optionType: OptionType;
  strike: string;
  expiry: string;
  multiplier: string;
  side: Side;
  date: string;
  entryTime: string;
  exitTime: string;
  qty: string;
  entryPrice: string;
  exitPrice: string;
  fees: string;
  rMultiple: string;
  setup: string;
  followedPlan: "yes" | "no" | "na";
  tags: string[];
  emotions: string[];
  notes: string;
}

function blankForm(date: string): FormState {
  return { symbol: "", assetClass: "STOCK", optionType: "CALL", strike: "", expiry: "", multiplier: "1", side: "LONG", date, entryTime: "09:45", exitTime: "", qty: "", entryPrice: "", exitPrice: "", fees: "0", rMultiple: "", setup: "", followedPlan: "na", tags: [], emotions: [], notes: "" };
}

function tradeToForm(t: Trade): FormState {
  return {
    symbol: t.symbol,
    assetClass: t.assetClass || "STOCK",
    optionType: t.optionType || "CALL",
    strike: t.strike == null ? "" : String(t.strike),
    expiry: t.expiry || "",
    multiplier: String(t.multiplier || 1),
    side: t.side,
    date: t.date,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    qty: String(t.qty),
    entryPrice: String(t.entryPrice),
    exitPrice: String(t.exitPrice),
    fees: String(t.fees || 0),
    rMultiple: t.rMultiple == null ? "" : String(t.rMultiple),
    setup: t.setup,
    followedPlan: t.followedPlan == null ? "na" : t.followedPlan ? "yes" : "no",
    tags: [...t.tags],
    emotions: [...t.emotions],
    notes: t.notes,
  };
}

export function TradeFormModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Trade | null }) {
  const { addTrade, updateTrade, state, toast } = useStore();
  const [f, setF] = useState<FormState>(blankForm(todayISO()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customTag, setCustomTag] = useState("");
  const [customEmo, setCustomEmo] = useState("");
  const lastEditing = useRef<string | null>(null);

  if (open && lastEditing.current !== (editing?.id ?? "new")) {
    lastEditing.current = editing?.id ?? "new";
    setF(editing ? tradeToForm(editing) : blankForm(todayISO()));
    setErrors({});
  }
  if (!open && lastEditing.current !== null) lastEditing.current = null;

  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));
  const toggle = (key: "tags" | "emotions", v: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));

  const preview = useMemo(() => {
    const qty = parseFloat(f.qty);
    const ep = parseFloat(f.entryPrice);
    const xp = parseFloat(f.exitPrice);
    if (isNaN(qty) || isNaN(ep) || isNaN(xp)) return null;
    return tradePnl({ side: f.side, qty, entryPrice: ep, exitPrice: xp, fees: parseFloat(f.fees) || 0, multiplier: parseFloat(f.multiplier) || 1 });
  }, [f.side, f.qty, f.entryPrice, f.exitPrice, f.fees, f.multiplier]);

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!f.symbol.trim()) errs.symbol = "Required";
    if (!f.date) errs.date = "Required";
    const qty = parseFloat(f.qty);
    if (isNaN(qty) || qty <= 0) errs.qty = "Must be > 0";
    const ep = parseFloat(f.entryPrice);
    if (isNaN(ep) || ep < 0) errs.entryPrice = "Invalid";
    const xp = parseFloat(f.exitPrice);
    if (isNaN(xp) || xp < 0) errs.exitPrice = "Invalid";
    const mult = parseFloat(f.multiplier);
    if (isNaN(mult) || mult <= 0) errs.multiplier = "Must be > 0";
    if (f.assetClass === "OPTION" && f.strike.trim() !== "" && isNaN(parseFloat(f.strike))) errs.strike = "Invalid";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const base = {
      symbol: f.symbol.trim().toUpperCase(),
      side: f.side,
      assetClass: f.assetClass,
      multiplier: mult > 0 ? mult : 1,
      optionType: f.assetClass === "OPTION" ? f.optionType : null,
      strike: f.assetClass === "OPTION" && f.strike.trim() !== "" ? parseFloat(f.strike) : null,
      expiry: f.assetClass === "OPTION" ? f.expiry : "",
      date: f.date,
      entryTime: f.entryTime,
      exitTime: f.exitTime,
      qty,
      entryPrice: ep,
      exitPrice: xp,
      fees: parseFloat(f.fees) || 0,
      rMultiple: f.rMultiple.trim() === "" ? null : round2(parseFloat(f.rMultiple) || 0),
      setup: f.setup.trim(),
      tags: f.tags,
      emotions: f.emotions,
      followedPlan: f.followedPlan === "na" ? null : f.followedPlan === "yes",
      notes: f.notes.trim(),
    };
    const pnl = tradePnl(base);
    if (editing) {
      updateTrade({ ...base, pnl, id: editing.id });
      toast(`Updated ${base.symbol} · ${fmtSigned(pnl, state.settings.currency)}`, pnl >= 0 ? "up" : "dn");
    } else {
      addTrade({ ...base, pnl });
      toast(`Logged ${base.symbol} ${base.side} · ${fmtSigned(pnl, state.settings.currency)}`, pnl >= 0 ? "up" : "dn");
    }
    onClose();
  };

  const err = (k: string) => errors[k] && <span className="ml-1 text-[10.5px] font-normal text-dn">{errors[k]}</span>;

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.symbol} · ${fmtDateNice(editing.date)}` : "Log a trade"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-deep px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-dim">Instrument</span>
            <Seg
              options={[
                { value: "STOCK", label: "Stock" },
                { value: "OPTION", label: "Option" },
                { value: "FUTURES", label: "Futures" },
              ]}
              value={f.assetClass}
              onChange={(v) => set({ assetClass: v, multiplier: String(defaultMultiplier(v, f.symbol)) })}
            />
          </div>
          <span className="font-mono text-[11px] text-dim">
            {f.assetClass === "STOCK" && "point value ×1"}
            {f.assetClass === "OPTION" && "premium × 100 / contract"}
            {f.assetClass === "FUTURES" &&
              (FUTURES_MULTIPLIERS[f.symbol.trim().toUpperCase()]
                ? `${f.symbol.trim().toUpperCase()} = $${FUTURES_MULTIPLIERS[f.symbol.trim().toUpperCase()]} / point`
                : "set $/point for this contract")}
          </span>
        </div>

        {f.assetClass === "OPTION" && (
          <div className="anim-rise grid grid-cols-2 gap-3 rounded-md border border-gold/25 bg-gold/[0.04] p-3 md:grid-cols-4">
            <div>
              <label className="lbl">Type</label>
              <Seg
                size="sm"
                options={[
                  { value: "CALL", label: <span className="text-up">CALL</span> },
                  { value: "PUT", label: <span className="text-dn">PUT</span> },
                ]}
                value={f.optionType}
                onChange={(v) => set({ optionType: v })}
              />
            </div>
            <div>
              <label className="lbl">Strike {err("strike")}</label>
              <input type="number" step="any" className="inp font-mono" value={f.strike} onChange={(e) => set({ strike: e.target.value })} placeholder="190" />
            </div>
            <div>
              <label className="lbl">Expiry</label>
              <input type="date" className="inp font-mono" value={f.expiry} onChange={(e) => set({ expiry: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Multiplier {err("multiplier")}</label>
              <input type="number" step="any" className="inp font-mono" value={f.multiplier} onChange={(e) => set({ multiplier: e.target.value })} />
            </div>
          </div>
        )}

        {f.assetClass === "FUTURES" && (
          <div className="anim-rise flex flex-wrap items-end gap-3 rounded-md border border-sky/25 bg-sky/[0.04] p-3">
            <div className="w-36">
              <label className="lbl">$/point {err("multiplier")}</label>
              <input type="number" step="any" className="inp font-mono" value={f.multiplier} onChange={(e) => set({ multiplier: e.target.value })} />
            </div>
            <p className="flex-1 pb-1 text-[11px] leading-relaxed text-dim">
              Micros: MNQ ×2 · MES ×5 · M2K ×5 · MYM ×0.5 · MCL ×100 · MGC ×10 · SIL ×1000 — pick a symbol above to auto-fill.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="lbl">Symbol {err("symbol")}</label>
            <input
              className="inp font-mono uppercase"
              list={f.assetClass === "FUTURES" ? "futures-presets" : undefined}
              value={f.symbol}
              onChange={(e) => {
                const sym = e.target.value;
                set(f.assetClass === "STOCK" ? { symbol: sym } : { symbol: sym, multiplier: String(defaultMultiplier(f.assetClass, sym)) });
              }}
              placeholder={f.assetClass === "FUTURES" ? "MNQ" : "AAPL"}
            />
            {f.assetClass === "FUTURES" && (
              <datalist id="futures-presets">
                {Object.keys(FUTURES_MULTIPLIERS).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className="lbl">Side</label>
            <div className="pt-0.5">
              <Seg
                options={[
                  { value: "LONG", label: <span className="text-up">LONG</span> },
                  { value: "SHORT", label: <span className="text-dn">SHORT</span> },
                ]}
                value={f.side}
                onChange={(v) => set({ side: v })}
              />
            </div>
          </div>
          <div>
            <label className="lbl">Date {err("date")}</label>
            <input type="date" className="inp font-mono" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="lbl">Entry</label>
              <input type="time" className="inp px-2 font-mono" value={f.entryTime} onChange={(e) => set({ entryTime: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Exit</label>
              <input type="time" className="inp px-2 font-mono" value={f.exitTime} onChange={(e) => set({ exitTime: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="lbl">Qty {err("qty")}</label>
            <input type="number" step="any" className="inp font-mono" value={f.qty} onChange={(e) => set({ qty: e.target.value })} placeholder="2" />
          </div>
          <div>
            <label className="lbl">Entry price {err("entryPrice")}</label>
            <input type="number" step="any" className="inp font-mono" value={f.entryPrice} onChange={(e) => set({ entryPrice: e.target.value })} placeholder="19840.50" />
          </div>
          <div>
            <label className="lbl">Exit price {err("exitPrice")}</label>
            <input type="number" step="any" className="inp font-mono" value={f.exitPrice} onChange={(e) => set({ exitPrice: e.target.value })} placeholder="19876.25" />
          </div>
          <div>
            <label className="lbl">Fees</label>
            <input type="number" step="any" className="inp font-mono" value={f.fees} onChange={(e) => set({ fees: e.target.value })} />
          </div>
          <div>
            <label className="lbl">R multiple</label>
            <input type="number" step="any" className="inp font-mono" value={f.rMultiple} onChange={(e) => set({ rMultiple: e.target.value })} placeholder="1.4" />
          </div>
        </div>

        <div
          className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 transition-colors ${
            preview == null ? "border-edge bg-deep" : preview >= 0 ? "border-up/30 bg-up/8" : "border-dn/30 bg-dn/8"
          }`}
        >
          <span className="text-[11px] uppercase tracking-[0.15em] text-dim">Realized P&L</span>
          <span className={`font-mono text-lg font-semibold tnum ${preview == null ? "text-dim" : pnlClass(preview)}`}>
            {preview == null ? "—" : fmtSigned(preview, state.settings.currency)}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="lbl">Setup</label>
            <input className="inp" list="setup-presets" value={f.setup} onChange={(e) => set({ setup: e.target.value })} placeholder="Opening Range Breakout" />
            <datalist id="setup-presets">
              {[...new Set([...SETUP_PRESETS, ...state.trades.map((t) => t.setup).filter(Boolean)])].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="lbl">Followed plan?</label>
            <div className="pt-0.5">
              <Seg
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "na", label: "—" },
                ]}
                value={f.followedPlan}
                onChange={(v) => set({ followedPlan: v })}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="lbl">Behavior tags</label>
          <div className="flex flex-wrap gap-1.5">
            {TAG_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle("tags", t)}
                className={`rounded border px-2 py-1 text-[11px] font-medium transition-all ${
                  f.tags.includes(t) ? "border-sky/50 bg-sky/15 text-sky" : "border-edge bg-deep text-fog hover:border-edge2 hover:text-snow"
                }`}
              >
                {t}
              </button>
            ))}
            {f.tags.filter((t) => !TAG_PRESETS.includes(t)).map((t) => (
              <button key={t} type="button" onClick={() => toggle("tags", t)} className="rounded border border-sky/50 bg-sky/15 px-2 py-1 text-[11px] font-medium text-sky">
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="inp py-1.5 text-xs" value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="Custom tag…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (customTag.trim()) { toggle("tags", customTag.trim()); setCustomTag(""); } } }} />
            <BtnGhost onClick={() => { if (customTag.trim()) { toggle("tags", customTag.trim()); setCustomTag(""); } }}>Add</BtnGhost>
          </div>
        </div>

        <div>
          <label className="lbl">Emotional state</label>
          <div className="flex flex-wrap gap-1.5">
            {EMO_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle("emotions", t)}
                className={`rounded border px-2 py-1 text-[11px] font-medium transition-all ${
                  f.emotions.includes(t) ? "border-gold/50 bg-gold/15 text-gold" : "border-edge bg-deep text-fog hover:border-edge2 hover:text-snow"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="lbl">Notes — what did you see, what did you feel?</label>
          <textarea className="inp min-h-[84px] resize-y leading-relaxed" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Entry rationale, management, what you'd repeat or avoid…" />
        </div>

        <div className="flex justify-end gap-2 border-t border-edge pt-4">
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary type="submit">{editing ? "Save changes" : "Log trade"}</BtnPrimary>
        </div>
      </form>
    </Modal>
  );
}

/* ================= Import modal ================= */

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importTrades, toast } = useStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ trades: Trade[]; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (t: string) => {
    setText(t);
    setResult(t.trim() ? csvToTrades(t) : null);
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ""));
    reader.readAsText(file);
  };

  const doImport = () => {
    if (!result || !result.trades.length) return;
    importTrades(result.trades);
    toast(`Imported ${result.trades.length} trades${result.skipped ? ` · ${result.skipped} rows skipped` : ""}`, "sky");
    setText("");
    setResult(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Import trades from CSV" wide>
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-fog">
          Paste a broker export or CSV with headers <span className="font-mono text-[11px] text-sky">symbol, side, date, qty, entryPrice, exitPrice</span> (plus optional
          assetClass, optionType, strike, expiry, multiplier, entryTime, exitTime, fees, rMultiple, setup, tags, emotions, followedPlan, notes). P&L is recalculated on
          import using the contract multiplier.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <BtnGhost onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Choose .csv file
          </BtnGhost>
          <BtnGhost onClick={() => download("taperead-template.csv", CSV_TEMPLATE, "text/csv")}>
            <Download size={13} /> Download template
          </BtnGhost>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </div>
        <textarea
          className="inp min-h-[160px] resize-y font-mono text-[11.5px] leading-relaxed"
          placeholder={"symbol,side,date,entryTime,exitTime,qty,entryPrice,exitPrice,fees,...\nAAPL,LONG,2025-01-06,09:45,10:12,50,190.10,191.40,2.50,..."}
          value={text}
          onChange={(e) => parse(e.target.value)}
        />
        {result && (
          <div className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-xs ${result.trades.length ? "border-up/30 bg-up/8 text-up" : "border-dn/30 bg-dn/8 text-dn"}`}>
            <span>
              {result.trades.length ? `${result.trades.length} trades ready to import` : "No valid rows found — check the header names"}
              {result.skipped > 0 && <span className="text-fog"> · {result.skipped} rows skipped</span>}
            </span>
            {result.trades.length > 0 && (
              <span className="font-mono tnum">
                net {fmtSigned(result.trades.reduce((s, t) => s + t.pnl, 0))}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-edge pt-4">
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <button
            onClick={doImport}
            disabled={!result || !result.trades.length}
            className="inline-flex items-center gap-1.5 rounded-md bg-up px-3.5 py-2 text-xs font-semibold text-abyss transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload size={13} /> Import
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Trades page ================= */

type SortKey = "date" | "pnl" | "symbol";

export default function Trades() {
  const { state, deleteTrades, toast } = useStore();
  const cur = state.settings.currency;
  const [q, setQ] = useState("");
  const [setup, setSetup] = useState("all");
  const [asset, setAsset] = useState("all");
  const [side, setSide] = useState("all");
  const [result, setResult] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string[] | null>(null);
  const [showN, setShowN] = useState(60);

  const setups = useMemo(() => [...new Set(state.trades.map((t) => t.setup).filter(Boolean))].sort(), [state.trades]);

  const filtered = useMemo(() => {
    let list = state.trades.filter((t) => {
      if (q && !(`${t.symbol} ${t.setup}`.toLowerCase().includes(q.toLowerCase()))) return false;
      if (setup !== "all" && t.setup !== setup) return false;
      if (asset !== "all" && t.assetClass !== asset) return false;
      if (side !== "all" && t.side !== side.toUpperCase()) return false;
      if (result === "win" && t.pnl <= 0) return false;
      if (result === "loss" && t.pnl >= 0) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
    list = sortTrades(list);
    list.sort((a, b) => {
      if (sortKey === "pnl") return (a.pnl - b.pnl) * sortDir;
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * sortDir;
      return 0; // date already sorted; dir handled below
    });
    if (sortKey === "date" && sortDir === 1) list = list.reverse();
    return list;
  }, [state.trades, q, setup, asset, side, result, from, to, sortKey, sortDir]);

  const shown = filtered.slice(0, showN);
  const netFiltered = round2(filtered.reduce((s, t) => s + t.pnl, 0));
  const netSelected = round2([...selected].map((id) => state.trades.find((t) => t.id === id)?.pnl ?? 0).reduce((s, p) => s + p, 0));

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  const sortIndicator = (k: SortKey) => (sortKey === k ? <span className="ml-1 text-sky">{sortDir === -1 ? "↓" : "↑"}</span> : null);

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const clearFilters = () => {
    setQ("");
    setSetup("all");
    setAsset("all");
    setSide("all");
    setResult("all");
    setFrom("");
    setTo("");
  };

  const selCls = "inp w-auto py-1.5 text-xs";

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <Reveal>
        <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="inp w-[170px] py-1.5 pl-8 text-xs" placeholder="Search symbol / setup" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={selCls} value={setup} onChange={(e) => setSetup(e.target.value)}>
            <option value="all">All setups</option>
            {setups.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className={selCls} value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="all">All instruments</option>
            <option value="STOCK">Stocks</option>
            <option value="OPTION">Options</option>
            <option value="FUTURES">Futures</option>
          </select>
          <select className={selCls} value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="all">Long + short</option>
            <option value="long">Long only</option>
            <option value="short">Short only</option>
          </select>
          <select className={selCls} value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="all">Wins + losses</option>
            <option value="win">Winners</option>
            <option value="loss">Losers</option>
          </select>
          <input type="date" className={`${selCls} font-mono`} value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <span className="text-dim">→</span>
          <input type="date" className={`${selCls} font-mono`} value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
          {(q || setup !== "all" || asset !== "all" || side !== "all" || result !== "all" || from || to) && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-fog transition-colors hover:text-snow">
              <X size={12} /> Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <BtnGhost onClick={() => setImportOpen(true)}>
              <Upload size={13} /> Import
            </BtnGhost>
            <BtnGhost onClick={() => { download(`taperead-trades-${todayISO()}.csv`, tradesToCSV(state.trades), "text/csv"); toast("Exported CSV", "sky"); }}>
              <Download size={13} /> CSV
            </BtnGhost>
            <BtnPrimary
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={14} /> Log trade
            </BtnPrimary>
          </div>
        </div>
      </Reveal>

      {/* selection bar */}
      {selected.size > 0 && (
        <div className="anim-rise card flex flex-wrap items-center gap-3 border-sky/30 bg-sky/6 px-4 py-2.5">
          <Filter size={13} className="text-sky" />
          <span className="text-xs font-medium text-snow">{selected.size} selected</span>
          <span className={`font-mono text-xs tnum ${pnlClass(netSelected)}`}>{fmtSigned(netSelected, cur)}</span>
          <div className="ml-auto flex gap-2">
            <BtnGhost onClick={() => setSelected(new Set())}>Deselect</BtnGhost>
            <BtnGhost danger onClick={() => setConfirmDel([...selected])}>
              <Trash2 size={13} /> Delete
            </BtnGhost>
          </div>
        </div>
      )}

      {/* table */}
      <Reveal delay={70}>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-edge text-[10.5px] uppercase tracking-[0.13em] text-dim">
                  <th className="w-9 px-3 py-3">
                    <input
                      type="checkbox"
                      className="accent-sky"
                      checked={shown.length > 0 && shown.every((t) => selected.has(t.id))}
                      onChange={(e) => {
                        const n = new Set(selected);
                        if (e.target.checked) shown.forEach((t) => n.add(t.id));
                        else shown.forEach((t) => n.delete(t.id));
                        setSelected(n);
                      }}
                    />
                  </th>
                  <th className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-snow" onClick={() => setSort("date")}>Date {sortIndicator("date")}</th>
                  <th className="cursor-pointer px-3 py-3 font-medium transition-colors hover:text-snow" onClick={() => setSort("symbol")}>Symbol {sortIndicator("symbol")}</th>
                  <th className="px-3 py-3 font-medium">Setup</th>
                  <th className="px-3 py-3 font-medium">Hours</th>
                  <th className="px-3 py-3 font-medium">Execution</th>
                  <th className="px-3 py-3 text-center font-medium">Plan</th>
                  <th className="px-3 py-3 text-right font-medium">R</th>
                  <th className="cursor-pointer px-4 py-3 text-right font-medium transition-colors hover:text-snow" onClick={() => setSort("pnl")}>P&L {sortIndicator("pnl")}</th>
                  <th className="w-16 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr
                    key={t.id}
                    className={`group border-b border-edge/60 transition-colors last:border-0 hover:bg-raise/50 ${selected.has(t.id) ? "bg-sky/5" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input type="checkbox" className="accent-sky" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-fog">
                      {fmtDateShort(t.date)}
                      <span className="ml-1.5 text-dim">{t.entryTime}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 font-semibold text-snow">
                        <span className="truncate">{contractLabel(t)}</span> <SideBadge side={t.side} /> <AssetBadge ac={t.assetClass} />
                      </span>
                    </td>
                    <td className="max-w-[170px] truncate px-3 py-2.5 text-fog">{t.setup || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-fog">{t.entryTime}{t.exitTime ? `–${t.exitTime}` : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-fog tnum">
                      {t.qty}
                      {t.multiplier !== 1 ? `×${t.multiplier}` : ""} @ {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-center"><PlanMark v={t.followedPlan} /></td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right font-mono tnum ${pnlClass(t.rMultiple ?? 0)}`}>
                      {t.rMultiple == null ? "—" : `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple.toFixed(1)}R`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <span className={`font-mono font-semibold tnum ${pnlClass(t.pnl)}`}>{fmtSigned(t.pnl, cur)}</span>
                      {t.tags.length > 0 && (
                        <span className="mt-0.5 flex justify-end gap-1">
                          {t.tags.slice(0, 2).map((tag) => (
                            <Tag key={tag} tone={/chased|moved|over|revenge|early|gamble|no setup/i.test(tag) ? "dn" : "up"}>{tag}</Tag>
                          ))}
                          {t.tags.length > 2 && <Tag>+{t.tags.length - 2}</Tag>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded-md p-1.5 text-fog transition-colors hover:bg-raise hover:text-sky"
                          title="Edit"
                          onClick={() => {
                            setEditing(t);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button className="rounded-md p-1.5 text-fog transition-colors hover:bg-dn/15 hover:text-dn" title="Delete" onClick={() => setConfirmDel([t.id])}>
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-dim">
                      No trades match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-4 py-3">
            <span className="text-[11.5px] text-fog">
              Showing <span className="font-mono text-snow tnum">{shown.length}</span> of <span className="font-mono text-snow tnum">{filtered.length}</span> filtered ·{" "}
              <span className="font-mono text-snow tnum">{state.trades.length}</span> total
            </span>
            <span className={`font-mono text-xs font-semibold tnum ${pnlClass(netFiltered)}`}>filtered net {fmtSigned(netFiltered, cur)}</span>
            {filtered.length > showN && (
              <button onClick={() => setShowN((n) => n + 60)} className="rounded-md border border-edge px-3 py-1.5 text-[11px] font-medium text-fog transition-colors hover:border-edge2 hover:text-snow">
                Show 60 more
              </button>
            )}
          </div>
        </div>
      </Reveal>

      <TradeFormModal open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <Confirm
        open={confirmDel != null}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => {
          if (confirmDel) {
            deleteTrades(confirmDel);
            toast(`Deleted ${confirmDel.length} trade${confirmDel.length === 1 ? "" : "s"}`, "dn");
            setSelected((s) => {
              const n = new Set(s);
              confirmDel.forEach((id) => n.delete(id));
              return n;
            });
          }
        }}
        title="Delete trades"
        body={`This permanently removes ${confirmDel?.length === 1 ? "this trade" : `${confirmDel?.length} trades`} from the journal. Consider exporting a CSV backup first.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
