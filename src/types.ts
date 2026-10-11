export type Side = "LONG" | "SHORT";

export type AssetClass = "STOCK" | "OPTION" | "FUTURES";

export type OptionType = "CALL" | "PUT";

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  /** STOCK | OPTION | FUTURES */
  assetClass: AssetClass;
  /** point value per unit: stocks = 1, option contracts = 100, futures = contract spec (MNQ = 2, MCL = 100…) */
  multiplier: number;
  /** options only */
  optionType: OptionType | null;
  /** options only */
  strike: number | null;
  /** options only, ISO date yyyy-MM-dd */
  expiry: string;
  /** ISO date yyyy-MM-dd */
  date: string;
  /** HH:mm 24h */
  entryTime: string;
  exitTime: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  /** net P&L in account currency */
  pnl: number;
  /** optional R multiple */
  rMultiple: number | null;
  setup: string;
  tags: string[];
  emotions: string[];
  followedPlan: boolean | null;
  notes: string;
}

export interface DayNote {
  /** yyyy-MM-dd */
  date: string;
  /** 1..5 */
  mood: number;
  followedPlan: boolean | null;
  text: string;
}

export interface Settings {
  accountName: string;
  startingBalance: number;
  riskPerTrade: number; // % of balance
  currency: "USD" | "EUR" | "GBP";
}

export interface AppState {
  trades: Trade[];
  dayNotes: DayNote[];
  settings: Settings;
  reviewed: string[];
}

export type SyncMode = "connecting" | "local" | "server";

export type Tone = "up" | "dn" | "gold" | "sky" | "fog";

export interface Insight {
  tone: Tone;
  icon: "calendar" | "clock" | "repeat" | "shield" | "flame" | "target" | "brain" | "alert" | "layers";
  text: string;
}

export interface DayPnl {
  date: string;
  pnl: number;
  count: number;
}

export interface GroupRow {
  key: string;
  label: string;
  count: number;
  wins: number;
  winRate: number; // 0..100
  pnl: number;
  avgR: number | null;
}

export interface EquityPoint {
  i: number;
  date: string;
  equity: number;
  dd: number; // drawdown % (<= 0)
}

export interface Stats {
  total: number;
  wins: number;
  losses: number;
  flat: number;
  winRate: number; // 0..100
  netPnl: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number; // Infinity when no losses
  expectancy: number; // per trade
  avgWin: number;
  avgLoss: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  avgR: number | null;
  equity: EquityPoint[];
  daily: DayPnl[];
  bySetup: GroupRow[];
  byAsset: GroupRow[];
  byOption: GroupRow[];
  byWeekday: GroupRow[];
  byHour: GroupRow[];
  byTag: GroupRow[];
  byEmotion: GroupRow[];
  bySide: GroupRow[];
  planRate: number | null;
  planPnlFollowed: number;
  planPnlBroken: number;
  curStreak: { kind: "win" | "loss"; n: number } | null;
  bestWinStreak: number;
  worstLossStreak: number;
  greenDays: number;
  redDays: number;
  maxDailyWin: DayPnl | null;
  maxDailyLoss: DayPnl | null;
}
