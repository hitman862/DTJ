import { format, subDays, addDays } from "date-fns";
import type { AssetClass, DayNote, OptionType, Trade } from "./types";
import { round2, tradePnl, uid } from "./utils";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SETUPS = [
  { name: "Opening Range Breakout", weight: 30, edge: 0.34 },
  { name: "VWAP Fade", weight: 22, edge: 0.2 },
  { name: "Bull Flag", weight: 18, edge: 0.12 },
  { name: "Momentum Continuation", weight: 16, edge: -0.05 },
  { name: "Knife-Catch Reversal", weight: 14, edge: -0.38 },
];

interface SymDef {
  sym: string;
  assetClass: AssetClass;
  multiplier: number;
  price: number;
  vol: number;
  qty: [number, number];
}

const SYMBOLS: SymDef[] = [
  { sym: "NQ", assetClass: "FUTURES", multiplier: 20, price: 19840, vol: 22, qty: [1, 2] },
  { sym: "MNQ", assetClass: "FUTURES", multiplier: 2, price: 19842, vol: 22, qty: [2, 6] },
  { sym: "ES", assetClass: "FUTURES", multiplier: 50, price: 5478, vol: 7, qty: [1, 2] },
  { sym: "MCL", assetClass: "FUTURES", multiplier: 100, price: 78.4, vol: 0.5, qty: [1, 3] },
  { sym: "AAPL", assetClass: "STOCK", multiplier: 1, price: 212.4, vol: 0.9, qty: [30, 120] },
  { sym: "TSLA", assetClass: "STOCK", multiplier: 1, price: 247.8, vol: 2.6, qty: [15, 60] },
  { sym: "NVDA", assetClass: "STOCK", multiplier: 1, price: 131.6, vol: 1.7, qty: [20, 90] },
  { sym: "SPY", assetClass: "STOCK", multiplier: 1, price: 546.9, vol: 0.6, qty: [15, 60] },
];

/** option underlyings: symbol, typical ATM price, typical 0DTE-ish premium */
const OPTION_DEFS = [
  { sym: "SPY", price: 546.9, prem: 2.1 },
  { sym: "AAPL", price: 212.4, prem: 2.6 },
  { sym: "TSLA", price: 247.8, prem: 4.8 },
  { sym: "NVDA", price: 131.6, prem: 3.4 },
];

const HOURS = [
  { h: 9, weight: 28, edge: 0.22 },
  { h: 10, weight: 22, edge: 0.14 },
  { h: 11, weight: 16, edge: 0.02 },
  { h: 12, weight: 8, edge: -0.3 },
  { h: 13, weight: 8, edge: -0.24 },
  { h: 14, weight: 9, edge: -0.06 },
  { h: 15, weight: 9, edge: 0.16 },
];

const LOSS_TAGS = ["Chased entry", "Moved stop", "Oversized", "Revenge trade", "Early exit", "News gamble", "No setup"];
const WIN_TAGS = ["A+ setup", "Patient entry", "Scaled out", "Textbook"];
const WIN_EMO = ["Calm", "Confident", "Focused"];
const LOSS_EMO = ["Anxious", "Greedy", "Frustrated", "FOMO", "Bored"];

const WIN_NOTES = [
  "Waited for the level to come to me. Entry right at the retest, stop below the low. Textbook.",
  "Saw the setup forming on the 5m, confirmed with tape speed. Took half off at 1R, trailed the rest.",
  "Clean execution. Did not touch the stop once. This is what a boring good trade feels like.",
  "Let the first move happen without me, entered on the first pullback. Patience paid.",
];

const LOSS_NOTES = [
  "Entered before confirmation because I was afraid of missing it. Chased and paid for it.",
  "Moved my stop wider 'just this once'. It hit the wider stop. Never again.",
  "Doubled size after a green morning to 'press the edge'. Gave it all back plus fees.",
  "Took the trade to make back the last one. Not in the plan. Obvious in hindsight.",
  "Exited at the first tick of heat, then watched it run to my target. Need to trust the stop.",
];

const OPT_NOTES = [
  "Bought the weekly after the breakout retest held. Theta was against me, momentum was with me.",
  "Swing entry on the daily flag. Let time decay work for me this time.",
  "Held the contract through the chop and gave back the whole premium. Should have taken the scalp.",
  "Lottery ticket into CPI. Knew it was a gamble before I clicked buy.",
];

const DAY_NOTES = [
  "Solid session. Only took what the market gave me and stopped when the edge faded.",
  "Fighted the tape all morning. Should have walked away after the second stop-out.",
  "Best focus this week. Pre-market plan written, levels marked, zero improvisation.",
  "Choppy and range-bound — forced a couple of trades out of boredom. Need to sit on hands.",
  "Missed the big move, then revenge-traded the pullback. Expensive lesson, again.",
  "Small green day but flawless execution. These are the days that compound.",
  "News whipsaw at the open. Waited 30 minutes and the setup came to me. Discipline.",
];

function weighted<T extends { weight: number }>(rnd: () => number, arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

const pick = <T,>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

function strikeFor(rnd: () => number, price: number): number {
  const step = price > 200 ? 5 : price > 100 ? 2.5 : 1;
  const off = Math.round((rnd() * 4 - 2)) * step;
  return round2(Math.round((price + off) / step) * step);
}

export function generateSample(): { trades: Trade[]; dayNotes: DayNote[] } {
  const rnd = mulberry32(1337);
  const trades: Trade[] = [];
  const dayNotes: DayNote[] = [];
  const today = new Date();

  const daysBack = 90;
  const dates: string[] = [];
  for (let i = daysBack; i >= 1; i--) {
    const d = subDays(today, i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    if (i <= 7 || rnd() < 0.62) dates.push(format(d, "yyyy-MM-dd"));
  }

  for (const date of dates) {
    const dow = new Date(date + "T12:00:00").getDay();
    const dowEdge = dow === 1 ? -0.16 : dow === 5 ? -0.09 : dow === 2 || dow === 3 ? 0.05 : 0;
    const nTrades = 1 + Math.floor(rnd() * 4) + (rnd() < 0.18 ? 1 : 0);
    let dayPnl = 0;
    let prevLoss = false;

    for (let i = 0; i < nTrades; i++) {
      const setup = weighted(rnd, SETUPS);
      const hour = weighted(rnd, HOURS);
      const symbol = pick(rnd, SYMBOLS);

      const risk = 110 + rnd() * 260;
      const edge = setup.edge + dowEdge + hour.edge;
      const winP = Math.min(0.78, Math.max(0.2, 0.46 + edge * 0.55));
      const isWin = rnd() < winP;
      let R = isWin ? 0.7 + rnd() * 2.3 : -(0.55 + rnd() * 0.75);
      if (!isWin && rnd() < 0.12) R = -(1.3 + rnd() * 0.6); // stop moved / slip

      const qty = symbol.qty[0] + Math.floor(rnd() * (symbol.qty[1] - symbol.qty[0] + 1));
      const side: Trade["side"] = rnd() < (isWin ? 0.62 : 0.55) ? "LONG" : "SHORT";
      const entryPrice = round2(symbol.price + (rnd() - 0.5) * symbol.vol * 6);
      const fees = round2(1.5 + rnd() * 4.5);
      const dir = side === "LONG" ? 1 : -1;
      const target = R * risk;
      const exitPrice = round2(entryPrice + (target + fees) / (qty * symbol.multiplier * dir));

      const t: Trade = {
        id: uid(),
        symbol: symbol.sym,
        side,
        assetClass: symbol.assetClass,
        multiplier: symbol.multiplier,
        optionType: null,
        strike: null,
        expiry: "",
        date,
        entryTime: "",
        exitTime: "",
        qty,
        entryPrice,
        exitPrice,
        fees,
        pnl: 0,
        rMultiple: round2(R),
        setup: setup.name,
        tags: [],
        emotions: [],
        followedPlan: null,
        notes: "",
      };
      const mm = Math.floor(rnd() * 60);
      t.entryTime = `${String(hour.h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const durMin = 6 + Math.floor(rnd() * 55);
      const eh = hour.h + Math.floor((mm + durMin) / 60);
      const emm = (mm + durMin) % 60;
      t.exitTime = eh <= 16 ? `${String(Math.min(eh, 16)).padStart(2, "0")}:${String(emm).padStart(2, "0")}` : "16:00";
      t.pnl = tradePnl(t);
      t.rMultiple = round2(t.pnl / risk);
      dayPnl = round2(dayPnl + t.pnl);

      if (t.pnl > 0) {
        t.tags = rnd() < 0.55 ? [pick(rnd, WIN_TAGS)] : [];
        t.emotions = [pick(rnd, WIN_EMO)];
        t.followedPlan = rnd() < 0.86;
        if (rnd() < 0.28) t.notes = pick(rnd, WIN_NOTES);
        prevLoss = false;
      } else {
        const tags: string[] = [pick(rnd, LOSS_TAGS)];
        if (prevLoss && rnd() < 0.5) tags.push("Revenge trade");
        t.tags = tags;
        t.emotions = [pick(rnd, LOSS_EMO)];
        t.followedPlan = rnd() < 0.42;
        if (rnd() < 0.4) t.notes = pick(rnd, LOSS_NOTES);
        prevLoss = true;
      }
      trades.push(t);
    }

    // ---- an options trade on ~38% of days ----
    if (rnd() < 0.38) {
      const def = pick(rnd, OPTION_DEFS);
      const hour = weighted(rnd, HOURS);
      const setup = pick(rnd, SETUPS.slice(0, 3));
      const isWin = rnd() < 0.46; // options skew loser-heavy (theta) but winners run
      const qty = 1 + Math.floor(rnd() * 4);
      const optionType: OptionType = rnd() < 0.62 ? "CALL" : "PUT";
      const strike = strikeFor(rnd, def.price);
      const entryPrice = round2(def.prem * (0.6 + rnd() * 1.1));
      const exitPrice = isWin
        ? round2(entryPrice * (1.5 + rnd() * 2.4))
        : round2(entryPrice * (0.15 + rnd() * 0.55));
      const fees = round2(0.65 * qty + rnd());
      const expiry = format(addDays(new Date(date + "T12:00:00"), 3 + Math.floor(rnd() * 18)), "yyyy-MM-dd");

      const t: Trade = {
        id: uid(),
        symbol: def.sym,
        side: "LONG",
        assetClass: "OPTION",
        multiplier: 100,
        optionType,
        strike,
        expiry,
        date,
        entryTime: "",
        exitTime: "",
        qty,
        entryPrice,
        exitPrice,
        fees,
        pnl: 0,
        rMultiple: null,
        setup: setup.name,
        tags: [],
        emotions: [],
        followedPlan: rnd() < 0.7,
        notes: rnd() < 0.5 ? pick(rnd, OPT_NOTES) : "",
      };
      const mm = Math.floor(rnd() * 60);
      t.entryTime = `${String(hour.h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const durMin = 20 + Math.floor(rnd() * 180);
      const eh = hour.h + Math.floor((mm + durMin) / 60);
      const emm = (mm + durMin) % 60;
      t.exitTime = eh <= 16 ? `${String(Math.min(eh, 16)).padStart(2, "0")}:${String(emm).padStart(2, "0")}` : "16:00";
      t.pnl = tradePnl(t);
      t.rMultiple = round2(t.pnl / (entryPrice * 100 * qty));
      dayPnl = round2(dayPnl + t.pnl);

      if (t.pnl > 0) {
        t.tags = rnd() < 0.5 ? ["Scaled out"] : [];
        t.emotions = [pick(rnd, WIN_EMO)];
      } else {
        t.tags = rnd() < 0.6 ? [pick(rnd, ["Early exit", "News gamble", "No setup"])] : [];
        t.emotions = [pick(rnd, LOSS_EMO)];
        prevLoss = true;
      }
      trades.push(t);
    }

    if (rnd() < 0.4) {
      dayNotes.push({
        date,
        mood: dayPnl > 250 ? 5 : dayPnl > 0 ? 4 : dayPnl > -180 ? 3 : 2,
        followedPlan: dayPnl > 0 ? rnd() < 0.8 : rnd() < 0.45,
        text: pick(rnd, DAY_NOTES),
      });
    }
  }

  return { trades, dayNotes };
}
