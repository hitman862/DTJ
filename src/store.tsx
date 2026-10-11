import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppState, DayNote, Settings, Stats, SyncMode, Trade } from "./types";
import { computeStats, normalizeTrade, uid } from "./utils";
import { generateSample } from "./sample";

const LS_KEY = "taperead.v1";
const API_PATH = "/api/data";

const DEFAULT_SETTINGS: Settings = {
  accountName: "Main Account",
  startingBalance: 25000,
  riskPerTrade: 1,
  currency: "USD",
};

const EMPTY: AppState = {
  trades: [],
  dayNotes: [],
  settings: DEFAULT_SETTINGS,
  reviewed: [],
};

type Action =
  | { type: "INIT"; data: AppState }
  | { type: "ADD_TRADE"; trade: Trade }
  | { type: "UPDATE_TRADE"; trade: Trade }
  | { type: "DELETE_TRADES"; ids: string[] }
  | { type: "IMPORT_TRADES"; trades: Trade[] }
  | { type: "UPSERT_NOTE"; note: DayNote }
  | { type: "DELETE_NOTE"; date: string }
  | { type: "SET_SETTINGS"; settings: Settings }
  | { type: "TOGGLE_REVIEWED"; id: string }
  | { type: "REPLACE"; data: AppState };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT":
    case "REPLACE":
      return action.data;
    case "ADD_TRADE":
      return { ...state, trades: [...state.trades, action.trade] };
    case "UPDATE_TRADE":
      return { ...state, trades: state.trades.map((t) => (t.id === action.trade.id ? action.trade : t)) };
    case "DELETE_TRADES": {
      const set = new Set(action.ids);
      return {
        ...state,
        trades: state.trades.filter((t) => !set.has(t.id)),
        reviewed: state.reviewed.filter((id) => !set.has(id)),
      };
    }
    case "IMPORT_TRADES":
      return { ...state, trades: [...state.trades, ...action.trades] };
    case "UPSERT_NOTE": {
      const rest = state.dayNotes.filter((n) => n.date !== action.note.date);
      return { ...state, dayNotes: [...rest, action.note].sort((a, b) => b.date.localeCompare(a.date)) };
    }
    case "DELETE_NOTE":
      return { ...state, dayNotes: state.dayNotes.filter((n) => n.date !== action.date) };
    case "SET_SETTINGS":
      return { ...state, settings: action.settings };
    case "TOGGLE_REVIEWED":
      return {
        ...state,
        reviewed: state.reviewed.includes(action.id)
          ? state.reviewed.filter((x) => x !== action.id)
          : [...state.reviewed, action.id],
      };
    default:
      return state;
  }
}

export interface Toast {
  id: string;
  msg: string;
  tone: "up" | "dn" | "sky" | "gold";
}

interface Ctx {
  state: AppState;
  stats: Stats;
  mode: SyncMode;
  toasts: Toast[];
  toast: (msg: string, tone?: Toast["tone"]) => void;
  addTrade: (t: Omit<Trade, "id">) => void;
  updateTrade: (t: Trade) => void;
  deleteTrades: (ids: string[]) => void;
  importTrades: (list: Trade[]) => void;
  upsertNote: (n: DayNote) => void;
  deleteNote: (date: string) => void;
  setSettings: (s: Settings) => void;
  toggleReviewed: (id: string) => void;
  loadSample: () => void;
  resetAll: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

function sanitize(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<AppState>;
  if (!Array.isArray(r.trades)) return null;
  return {
    trades: r.trades.map(normalizeTrade).filter((t): t is Trade => t !== null),
    dayNotes: Array.isArray(r.dayNotes) ? r.dayNotes : [],
    settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) },
    reviewed: Array.isArray(r.reviewed) ? r.reviewed : [],
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<SyncMode>("connecting");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  // ---- initial load: server first, then localStorage ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data: AppState | null = null;
      let fromServer = false;
      try {
        const r = await fetch(API_PATH, { headers: { Accept: "application/json" } });
        if (r.ok) {
          const j = await r.json();
          const s = sanitize(j?.data ?? j);
          if (s) {
            data = s;
            fromServer = true;
          }
        }
      } catch {
        /* no server available — local mode */
      }
      if (!data) {
        try {
          const ls = localStorage.getItem(LS_KEY);
          if (ls) data = sanitize(JSON.parse(ls));
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) {
        dispatch({ type: "INIT", data: data ?? EMPTY });
        setMode(fromServer ? "server" : "local");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- persist: localStorage always, server debounced ----
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* storage full — ignore */
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: state }),
        });
        if (r.ok) setMode("server");
      } catch {
        setMode("local");
      }
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [state, loaded]);

  const toast = useCallback((msg: string, tone: Toast["tone"] = "up") => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const stats = useMemo(() => computeStats(state.trades, state.settings.startingBalance), [state.trades, state.settings.startingBalance]);

  const value: Ctx = useMemo(
    () => ({
      state,
      stats,
      mode,
      toasts,
      toast,
      addTrade: (t) => dispatch({ type: "ADD_TRADE", trade: { ...t, id: uid() } }),
      updateTrade: (t) => dispatch({ type: "UPDATE_TRADE", trade: t }),
      deleteTrades: (ids) => dispatch({ type: "DELETE_TRADES", ids }),
      importTrades: (list) => dispatch({ type: "IMPORT_TRADES", trades: list }),
      upsertNote: (n) => dispatch({ type: "UPSERT_NOTE", note: n }),
      deleteNote: (date) => dispatch({ type: "DELETE_NOTE", date }),
      setSettings: (s) => dispatch({ type: "SET_SETTINGS", settings: s }),
      toggleReviewed: (id) => dispatch({ type: "TOGGLE_REVIEWED", id }),
      loadSample: () => {
        const { trades, dayNotes } = generateSample();
        dispatch({ type: "REPLACE", data: { ...state, trades, dayNotes, reviewed: [] } });
      },
      resetAll: () => dispatch({ type: "REPLACE", data: { ...EMPTY, settings: state.settings } }),
    }),
    [state, stats, mode, toasts, toast]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
