import { format, startOfMonth, getDay, addDays, getDaysInMonth } from "date-fns";
import type { AssetClass, DayPnl, EquityPoint, GroupRow, Insight, OptionType, Stats, Trade } from "./types";

/* ---------------- ids & numbers ---------------- */

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function tradePnl(t: Pick<Trade, "side" | "qty" | "entryPrice" | "exitPrice" | "fees"> & { multiplier?: number }): number {
  const dir = t.side === "LONG" ? 1 : -1;
  const m = typeof t.multiplier === "number" && t.multiplier > 0 ? t.multiplier : 1;
  return round2((t.exitPrice - t.entryPrice) * t.qty * m * dir - (t.fees || 0));
}

/* ---------------- instrument specs ---------------- */

/** common futures contracts: symbol → $ per point (multiplier) */
export const FUTURES_MULTIPLIERS: Record<string, number> = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  CL: 1000, MCL: 100, NG: 10000,
  GC: 100, MGC: 10, SI: 5000, SIL: 1000,
  ZN: 1000, ZB: 1000,
  "6E": 125000, M6E: 12500, "6B": 62500, "6J": 12500000, M6J: 1250000,
};

export const ASSET_LABELS: Record<AssetClass, string> = { STOCK: "Stocks", OPTION: "Options", FUTURES: "Futures" };

export function defaultMultiplier(assetClass: AssetClass, symbol: string): number {
  if (assetClass === "OPTION") return 100;
  if (assetClass === "FUTURES") return FUTURES_MULTIPLIERS[symbol.toUpperCase()] ?? 1;
  return 1;
}

/** human label for a position: "AAPL 190C 01/17" for options, symbol otherwise */
export function contractLabel(t: Pick<Trade, "symbol" | "assetClass" | "optionType" | "strike" | "expiry">): string {
  if (t.assetClass === "OPTION" && t.optionType) {
    const cp = t.optionType === "CALL" ? "C" : "P";
    const strike = t.strike != null ? String(t.strike) : "";
    const exp = t.expiry ? ` ${t.expiry.slice(5).replace("-", "/")}` : "";
    return `${t.symbol} ${strike}${cp}${exp}`.trim();
  }
  return t.symbol;
}

/** migrate raw stored/imported trades (pre-multi-asset rows default to stocks) */
export function normalizeTrade(raw: unknown): Trade | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Trade>;
  if (typeof t.symbol !== "string" || typeof t.pnl !== "number") return null;
  const assetClass: AssetClass = t.assetClass === "OPTION" || t.assetClass === "FUTURES" ? t.assetClass : "STOCK";
  const optionType: OptionType | null = t.optionType === "CALL" || t.optionType === "PUT" ? t.optionType : null;
  return {
    id: typeof t.id === "string" && t.id ? t.id : uid(),
    symbol: t.symbol,
    side: t.side === "SHORT" ? "SHORT" : "LONG",
    assetClass,
    multiplier: typeof t.multiplier === "number" && t.multiplier > 0 ? t.multiplier : defaultMultiplier(assetClass, t.symbol),
    optionType,
    strike: typeof t.strike === "number" ? t.strike : null,
    expiry: typeof t.expiry === "string" ? t.expiry : "",
    date: typeof t.date === "string" && t.date ? t.date : todayISO(),
    entryTime: typeof t.entryTime === "string" ? t.entryTime : "",
    exitTime: typeof t.exitTime === "string" ? t.exitTime : "",
    qty: typeof t.qty === "number" && !isNaN(t.qty) ? t.qty : 1,
    entryPrice: typeof t.entryPrice === "number" ? t.entryPrice : 0,
    exitPrice: typeof t.exitPrice === "number" ? t.exitPrice : 0,
    fees: typeof t.fees === "number" ? t.fees : 0,
    pnl: t.pnl,
    rMultiple: typeof t.rMultiple === "number" ? t.rMultiple : null,
    setup: typeof t.setup === "string" ? t.setup : "",
    tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    emotions: Array.isArray(t.emotions) ? t.emotions.map(String) : [],
    followedPlan: typeof t.followedPlan === "boolean" ? t.followedPlan : null,
    notes: typeof t.notes === "string" ? t.notes : "",
  };
}

/* ---------------- formatting ---------------- */

export function fmtMoney(n: number, currency: string = "USD", digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtSigned(n: number, currency: string = "USD"): string {
  const s = fmtMoney(Math.abs(n), currency);
  if (n > 0) return `+${s}`;
  if (n < 0) return `-${s}`;
  return s;
}

export function fmtCompact(n: number, currency: string = "USD"): string {
  const sign = n < 0 ? "-" : "";
  return (
    sign +
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Math.abs(n))
  );
}

export const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export function fmtDateNice(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return format(d, "EEE, MMM d yyyy");
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return format(d, "MMM d");
}

export const todayISO = () => format(new Date(), "yyyy-MM-dd");

/* ---------------- statistics ---------------- */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) =>
    a.date === b.date ? (a.entryTime || "").localeCompare(b.entryTime || "") : a.date.localeCompare(b.date)
  );
}

function groupRows(trades: Trade[], keyOf: (t: Trade) => string, labelOf?: (k: string) => string): GroupRow[] {
  const m = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = keyOf(t) || "—";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(t);
  }
  const rows: GroupRow[] = [];
  for (const [key, list] of m) {
    const wins = list.filter((t) => t.pnl > 0).length;
    const losses = list.filter((t) => t.pnl < 0).length;
    const rs = list.filter((t) => t.rMultiple != null);
    rows.push({
      key,
      label: labelOf ? labelOf(key) : key,
      count: list.length,
      wins,
      winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
      pnl: round2(list.reduce((s, t) => s + t.pnl, 0)),
      avgR: rs.length ? round2(rs.reduce((s, t) => s + (t.rMultiple || 0), 0) / rs.length) : null,
    });
  }
  return rows;
}

export function computeStats(trades: Trade[], startingBalance: number): Stats {
  const sorted = sortTrades(trades);
  const total = sorted.length;

  let equity = startingBalance;
  let peak = startingBalance;
  const equityPts: EquityPoint[] = sorted.map((t, i) => {
    equity = round2(equity + t.pnl);
    peak = Math.max(peak, equity);
    return { i: i + 1, date: t.date, equity, dd: peak > 0 ? round2(((equity - peak) / peak) * 100) : 0 };
  });

  const wins = sorted.filter((t) => t.pnl > 0);
  const losses = sorted.filter((t) => t.pnl < 0);
  const flat = total - wins.length - losses.length;
  const grossWin = round2(wins.reduce((s, t) => s + t.pnl, 0));
  const grossLoss = round2(Math.abs(losses.reduce((s, t) => s + t.pnl, 0)));
  const netPnl = round2(grossWin - grossLoss);

  const dailyMap = new Map<string, DayPnl>();
  for (const t of sorted) {
    const d = dailyMap.get(t.date) || { date: t.date, pnl: 0, count: 0 };
    d.pnl = round2(d.pnl + t.pnl);
    d.count += 1;
    dailyMap.set(t.date, d);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // streaks (chronological)
  let bestWinStreak = 0;
  let worstLossStreak = 0;
  let runKind: "win" | "loss" | null = null;
  let run = 0;
  for (const t of sorted) {
    const kind = t.pnl > 0 ? "win" : t.pnl < 0 ? "loss" : null;
    if (kind === null) continue;
    if (kind === runKind) run += 1;
    else {
      runKind = kind;
      run = 1;
    }
    if (kind === "win") bestWinStreak = Math.max(bestWinStreak, run);
    else worstLossStreak = Math.max(worstLossStreak, run);
  }
  const curStreak = runKind ? { kind: runKind, n: run } : null;

  const weekdayOrder = [1, 2, 3, 4, 5, 0, 6];
  const byWeekdayRaw = groupRows(
    sorted,
    (t) => String(new Date(t.date + "T12:00:00").getDay()),
    (k) => WEEKDAY_LABELS[Number(k)]
  );
  const byWeekday = weekdayOrder
    .map((i) => byWeekdayRaw.find((r) => r.key === String(i)))
    .filter((r): r is GroupRow => !!r);

  const hourLabel = (h: number) => (h < 12 ? `${h}:00a` : h === 12 ? "12:00p" : `${h - 12}:00p`);
  const byHourRaw = groupRows(
    sorted.filter((t) => t.entryTime),
    (t) => String(parseInt(t.entryTime.slice(0, 2), 10)),
    (k) => hourLabel(Number(k))
  );
  const byHour = byHourRaw.sort((a, b) => Number(a.key) - Number(b.key));

  const decided = sorted.filter((t) => t.followedPlan != null);
  const followed = decided.filter((t) => t.followedPlan);

  const rs = sorted.filter((t) => t.rMultiple != null);

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    flat,
    winRate: wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0,
    netPnl,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: total > 0 ? round2(netPnl / total) : 0,
    avgWin: wins.length ? round2(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    bestTrade: wins.length ? wins.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null,
    worstTrade: losses.length ? losses.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null,
    avgR: rs.length ? round2(rs.reduce((s, t) => s + (t.rMultiple || 0), 0) / rs.length) : null,
    equity: equityPts,
    daily,
    bySetup: groupRows(sorted, (t) => t.setup).sort((a, b) => b.pnl - a.pnl),
    byAsset: (["STOCK", "OPTION", "FUTURES"] as AssetClass[])
      .map((ac) => groupRows(sorted.filter((t) => t.assetClass === ac), () => ac, (k) => ASSET_LABELS[k as AssetClass])[0])
      .filter((r): r is GroupRow => !!r),
    byOption: groupRows(
      sorted.filter((t) => t.assetClass === "OPTION" && t.optionType),
      (t) => t.optionType as string,
      (k) => (k === "CALL" ? "Calls" : "Puts")
    ),
    byWeekday,
    byHour,
    byTag: groupRows(sorted, (t) => t.tags.join("|"))
      .flatMap((r) =>
        r.key === "—"
          ? []
          : r.key.split("|").map((tag) => ({ tag, share: 1 / r.key.split("|").length, r }))
      )
      .reduce<GroupRow[]>((acc, { tag, share, r }) => {
        const existing = acc.find((x) => x.key === tag);
        if (existing) {
          existing.count += Math.round(share * 10) / 10;
          existing.pnl = round2(existing.pnl + r.pnl * share);
          existing.wins += r.wins * share;
        } else {
          acc.push({ ...r, key: tag, label: tag, count: Math.round(share * 10) / 10, pnl: round2(r.pnl * share), wins: r.wins * share });
        }
        return acc;
      }, [])
      .map((r) => ({ ...r, count: Math.round(r.count), winRate: r.count ? (r.wins / r.count) * 100 : 0 }))
      .sort((a, b) => a.pnl - b.pnl),
    byEmotion: groupRows(sorted, (t) => t.emotions.join("|"))
      .flatMap((r) =>
        r.key === "—"
          ? []
          : r.key.split("|").map((tag) => ({ tag, share: 1 / r.key.split("|").length, r }))
      )
      .reduce<GroupRow[]>((acc, { tag, share, r }) => {
        const existing = acc.find((x) => x.key === tag);
        if (existing) {
          existing.count += share;
          existing.pnl = round2(existing.pnl + r.pnl * share);
          existing.wins += r.wins * share;
        } else {
          acc.push({ ...r, key: tag, label: tag, count: share, pnl: round2(r.pnl * share), wins: r.wins * share });
        }
        return acc;
      }, [])
      .map((r) => ({ ...r, count: Math.round(r.count), winRate: r.count ? (r.wins / r.count) * 100 : 0 }))
      .sort((a, b) => a.pnl - b.pnl),
    bySide: groupRows(sorted, (t) => t.side),
    planRate: decided.length ? (followed.length / decided.length) * 100 : null,
    planPnlFollowed: round2(followed.reduce((s, t) => s + t.pnl, 0)),
    planPnlBroken: round2(decided.filter((t) => !t.followedPlan).reduce((s, t) => s + t.pnl, 0)),
    curStreak,
    bestWinStreak,
    worstLossStreak,
    greenDays: daily.filter((d) => d.pnl > 0).length,
    redDays: daily.filter((d) => d.pnl < 0).length,
    maxDailyWin: daily.length ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null,
    maxDailyLoss: daily.length ? daily.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null,
  };
}

/* ---------------- insights ---------------- */

export function buildInsights(s: Stats): Insight[] {
  const out: Insight[] = [];
  if (s.total === 0) return out;

  const wd = s.byWeekday.filter((r) => r.count >= 3);
  if (wd.length) {
    const worst = wd.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    const best = wd.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    if (worst.pnl < 0)
      out.push({
        tone: "dn",
        icon: "calendar",
        text: `${dayFull(worst.label)}s are bleeding you: ${fmtSigned(worst.pnl)} across ${worst.count} trades (${fmtPct(worst.winRate, 0)} win).`,
      });
    if (best.pnl > 0 && best.label !== worst.label)
      out.push({
        tone: "up",
        icon: "calendar",
        text: `${dayFull(best.label)}s are your edge: ${fmtSigned(best.pnl)} at a ${fmtPct(best.winRate, 0)} win rate.`,
      });
  }

  const hours = s.byHour.filter((r) => r.count >= 3);
  if (hours.length) {
    const best = hours.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const worst = hours.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    if (best.pnl > 0)
      out.push({
        tone: "up",
        icon: "clock",
        text: `Your golden hour is the ${best.label} bucket: ${fmtSigned(best.pnl)} on ${best.count} trades.`,
      });
    if (worst.pnl < 0)
      out.push({
        tone: "gold",
        icon: "clock",
        text: `The ${worst.label} bucket costs you ${fmtSigned(worst.pnl)} — consider sitting out that window.`,
      });
  }

  const heavy = s.daily.filter((d) => d.count > 3);
  const light = s.daily.filter((d) => d.count <= 3);
  if (heavy.length >= 3 && light.length >= 3) {
    const heavyAvg = heavy.reduce((a, d) => a + d.pnl, 0) / heavy.length;
    const lightAvg = light.reduce((a, d) => a + d.pnl, 0) / light.length;
    if (heavyAvg < lightAvg - 20)
      out.push({
        tone: "dn",
        icon: "repeat",
        text: `After 3+ trades in a session your average day drops to ${fmtSigned(heavyAvg)} vs ${fmtSigned(lightAvg)} — overtrading is expensive.`,
      });
  }

  if (s.planRate != null) {
    if (s.planPnlFollowed > s.planPnlBroken)
      out.push({
        tone: "sky",
        icon: "shield",
        text: `Plan-followed trades net ${fmtSigned(s.planPnlFollowed)}; rule-breaking trades net ${fmtSigned(s.planPnlBroken)}. Discipline is literally paying you.`,
      });
    else
      out.push({
        tone: "gold",
        icon: "shield",
        text: `Broken-rule trades are outperforming followed ones (${fmtSigned(s.planPnlBroken)} vs ${fmtSigned(s.planPnlFollowed)}) — your plan may need a rewrite.`,
      });
  }

  const revenge = s.byTag.find((t) => /revenge/i.test(t.key));
  if (revenge && revenge.pnl < 0)
    out.push({
      tone: "dn",
      icon: "flame",
      text: `Revenge trades have cost you ${fmtSigned(revenge.pnl)} across ${revenge.count} executions. Walk away after a stop-out.`,
    });

  if (s.worstTrade)
    out.push({
      tone: "gold",
      icon: "alert",
      text: `Largest single loss: ${fmtSigned(s.worstTrade.pnl)} on ${s.worstTrade.symbol} (${s.worstTrade.setup || "no setup"}). Size it against your max daily loss.`,
    });

  const setups = s.bySetup.filter((r) => r.count >= 3);
  if (setups.length >= 2) {
    const top = setups[0];
    const bottom = setups[setups.length - 1];
    if (top.pnl > 0 && bottom.pnl < 0)
      out.push({
        tone: "up",
        icon: "target",
        text: `${top.label} carries the book (${fmtSigned(top.pnl)}, ${fmtPct(top.winRate, 0)} win) while ${bottom.label} gives back ${fmtSigned(bottom.pnl)}.`,
      });
  }

  if (s.curStreak && s.curStreak.kind === "loss" && s.curStreak.n >= 3)
    out.push({
      tone: "dn",
      icon: "brain",
      text: `You're on a ${s.curStreak.n}-trade losing streak. Consider halving size until the next green session.`,
    });

  const opt = s.byAsset.find((r) => r.key === "OPTION");
  const fut = s.byAsset.find((r) => r.key === "FUTURES");
  const stk = s.byAsset.find((r) => r.key === "STOCK");
  if (opt && opt.count >= 3) {
    if (opt.pnl < 0)
      out.push({
        tone: "gold",
        icon: "layers",
        text: `Options are net ${fmtSigned(opt.pnl)} across ${opt.count} trades (${fmtPct(opt.winRate, 0)} win) — premium decay and sizing are working against you.`,
      });
    else
      out.push({
        tone: "up",
        icon: "layers",
        text: `Options add ${fmtSigned(opt.pnl)} at a ${fmtPct(opt.winRate, 0)} win rate — your most leveraged instrument is behaving.`,
      });
  }
  if (fut && fut.count >= 3 && fut.pnl !== 0)
    out.push({
      tone: fut.pnl > 0 ? "sky" : "dn",
      icon: "layers",
      text: `Futures ${fut.pnl > 0 ? "carry" : "are dragging"} ${fmtSigned(fut.pnl)} of the book across ${fut.count} contracts traded.`,
    });
  const cp = s.byOption.filter((r) => r.count >= 3);
  if (cp.length === 2 && cp[0].pnl !== cp[1].pnl) {
    const worstCp = cp.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    if (worstCp.pnl < 0)
      out.push({
        tone: "gold",
        icon: "layers",
        text: `${worstCp.label} cost you ${fmtSigned(worstCp.pnl)} vs ${fmtSigned(cp.find((r) => r !== worstCp)!.pnl)} for the other side — check your directional bias.`,
      });
  }
  void stk;

  return out.slice(0, 7);
}

function dayFull(abbr: string): string {
  const map: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  return map[abbr] || abbr;
}

/* ---------------- calendar ---------------- */

/** weeks x 7 matrix of ISO dates (null = outside month) */
export function monthMatrix(year: number, monthIdx: number): (string | null)[][] {
  const first = startOfMonth(new Date(year, monthIdx, 1));
  const offset = getDay(first);
  const dim = getDaysInMonth(first);
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(format(new Date(year, monthIdx, d), "yyyy-MM-dd"));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ---------------- CSV ---------------- */

export const CSV_HEADER = [
  "symbol",
  "assetClass",
  "optionType",
  "strike",
  "expiry",
  "multiplier",
  "side",
  "date",
  "entryTime",
  "exitTime",
  "qty",
  "entryPrice",
  "exitPrice",
  "fees",
  "rMultiple",
  "setup",
  "tags",
  "emotions",
  "followedPlan",
  "notes",
];

function csvEsc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function tradesToCSV(trades: Trade[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const t of sortTrades(trades)) {
    lines.push(
      [
        t.symbol,
        t.assetClass || "STOCK",
        t.optionType || "",
        t.strike == null ? "" : String(t.strike),
        t.expiry || "",
        String(t.multiplier || 1),
        t.side,
        t.date,
        t.entryTime,
        t.exitTime,
        String(t.qty),
        String(t.entryPrice),
        String(t.exitPrice),
        String(t.fees || 0),
        t.rMultiple == null ? "" : String(t.rMultiple),
        t.setup,
        t.tags.join("|"),
        t.emotions.join("|"),
        t.followedPlan == null ? "" : t.followedPlan ? "yes" : "no",
        t.notes,
      ]
        .map(csvEsc)
        .join(",")
    );
  }
  return lines.join("\n");
}

export const CSV_TEMPLATE = `symbol,assetClass,optionType,strike,expiry,multiplier,side,date,entryTime,exitTime,qty,entryPrice,exitPrice,fees,rMultiple,setup,tags,emotions,followedPlan,notes
AAPL,STOCK,,,1,,LONG,2025-01-06,09:45,10:12,50,190.10,191.40,2.50,1.8,Opening Range Breakout,A+ setup,Calm,yes,Clean ORB over the opening high
MNQ,FUTURES,,,,2,SHORT,2025-01-06,11:20,11:41,4,21240.50,21266.00,3.80,-1,VWAP Fade,Moved stop,Frustrated,no,Faded too early into trend
SPY,OPTION,CALL,550,2025-01-17,100,LONG,2025-01-07,10:05,13:30,2,2.10,4.55,1.30,2.3,Momentum Continuation,Scaled out,Confident,yes,Bought the breakout retest`;

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["yes", "true", "1", "y"].includes(s)) return true;
  if (["no", "false", "0", "n"].includes(s)) return false;
  return null;
}

export function csvToTrades(text: string): { trades: Trade[]; skipped: number } {
  const rows = parseCSV(text);
  if (!rows.length) return { trades: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx("symbol") < 0 || idx("date") < 0) return { trades: [], skipped: rows.length - 1 };
  const out: Trade[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 && i < r.length ? r[i].trim() : "";
    };
    const qty = parseFloat(get("qty") || "1");
    const entryPrice = parseFloat(get("entryprice"));
    const exitPrice = parseFloat(get("exitprice"));
    if (!get("symbol") || !get("date") || isNaN(qty) || isNaN(entryPrice) || isNaN(exitPrice)) {
      skipped++;
      continue;
    }
    const side = get("side").toUpperCase().startsWith("S") ? "SHORT" : "LONG";
    const fees = parseFloat(get("fees")) || 0;
    const assetClass: AssetClass = (["STOCK", "OPTION", "FUTURES"] as const).includes(get("assetclass").toUpperCase() as AssetClass)
      ? (get("assetclass").toUpperCase() as AssetClass)
      : "STOCK";
    const optionType: OptionType | null =
      get("optiontype").toUpperCase() === "CALL" || get("optiontype").toUpperCase() === "PUT"
        ? (get("optiontype").toUpperCase() as OptionType)
        : assetClass === "OPTION"
        ? "CALL"
        : null;
    const t: Trade = {
      id: uid(),
      symbol: get("symbol").toUpperCase(),
      side,
      assetClass,
      multiplier: parseFloat(get("multiplier")) > 0 ? parseFloat(get("multiplier")) : defaultMultiplier(assetClass, get("symbol")),
      optionType,
      strike: get("strike") ? parseFloat(get("strike")) : null,
      expiry: get("expiry"),
      date: get("date"),
      entryTime: get("entrytime"),
      exitTime: get("exittime"),
      qty,
      entryPrice,
      exitPrice,
      fees,
      pnl: 0,
      rMultiple: get("rmultiple") ? parseFloat(get("rmultiple")) : null,
      setup: get("setup"),
      tags: get("tags") ? get("tags").split("|").map((s) => s.trim()).filter(Boolean) : [],
      emotions: get("emotions") ? get("emotions").split("|").map((s) => s.trim()).filter(Boolean) : [],
      followedPlan: get("followedplan") ? parseBool(get("followedplan")) : null,
      notes: get("notes"),
    };
    t.pnl = tradePnl(t);
    out.push(t);
  }
  return { trades: out, skipped };
}

/* ---------------- misc ---------------- */

export function download(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function timeAgo(iso: string): string {
  const d = new Date(iso + "T12:00:00").getTime();
  const diff = Date.now() - d;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export { addDays };
