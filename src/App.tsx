import { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { BarChart3, BookOpen, History, ListChecks, Menu, Settings2, X, LayoutDashboard } from "lucide-react";
import { StoreProvider, useStore } from "./store";
import { fmtMoney, fmtSigned } from "./utils";
import { Num, ToastHost, pnlClass } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import Trades from "./pages/Trades";
import Analytics from "./pages/Analytics";
import Journal from "./pages/Journal";
import Review from "./pages/Review";
import SettingsPage from "./pages/Settings";

/* ---------------- logo ---------------- */

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#13203a" />
      <rect x="9.5" y="6" width="1.4" height="20" rx="0.7" fill="#3ddc97" />
      <rect x="7" y="11" width="6.4" height="10" rx="1.4" fill="#3ddc97" />
      <rect x="21.1" y="5" width="1.4" height="18" rx="0.7" fill="#ff6472" />
      <rect x="18.6" y="9" width="6.4" height="8" rx="1.4" fill="#ff6472" />
    </svg>
  );
}

/* ---------------- ticker tape (live via /api/quotes → Yahoo) ---------------- */

interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  state?: string;
  stale?: boolean;
}

/** curated tape — matches server TAPE (Alpha Vantage symbols; ETF proxies for futures) */
const TAPE_FALLBACK: Record<string, { label: string; p: number }> = {
  SPX: { label: "S&P 500", p: 5470.4 }, IXIC: { label: "Nasdaq", p: 17862.2 },
  DJI: { label: "Dow", p: 39410.2 }, VIX: { label: "VIX", p: 13.42 },
  SPY: { label: "SPY", p: 546.9 }, QQQ: { label: "QQQ", p: 471.3 },
  USO: { label: "Crude", p: 78.42 }, GLD: { label: "Gold", p: 221.6 },
  AAPL: { label: "AAPL", p: 212.44 }, NVDA: { label: "NVDA", p: 131.62 },
  TSLA: { label: "TSLA", p: 247.83 }, BTC: { label: "BTC", p: 64230 },
};

interface TapeMeta {
  refreshedAt: number | null;
  nextRefreshAt: string | null;
  callsToday?: number;
  dailyLimit?: number;
}

const hhmmz = (iso: string | number | null | undefined) => {
  if (!iso) return "";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}z`;
};

function TickerTape() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [meta, setMeta] = useState<TapeMeta | null>(null);
  const [offline, setOffline] = useState(false);
  const [flash, setFlash] = useState<Record<string, "up" | "dn">>({});
  const prevRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/quotes");
        if (!r.ok) throw new Error("bad status");
        const j = await r.json();
        if (!alive) return;
        if (Array.isArray(j.quotes) && j.quotes.length) {
          const fl: Record<string, "up" | "dn"> = {};
          for (const q of j.quotes as Quote[]) {
            const p = prevRef.current[q.symbol];
            if (p != null && Math.abs(q.price - p) > 1e-9) fl[q.symbol] = q.price > p ? "up" : "dn";
            prevRef.current[q.symbol] = q.price;
          }
          setFlash(fl);
          if (Object.keys(fl).length) window.setTimeout(() => setFlash({}), 2200);
          setQuotes(j.quotes);
          setMeta({ refreshedAt: j.refreshedAt, nextRefreshAt: j.nextRefreshAt, callsToday: j.callsToday, dailyLimit: j.dailyLimit });
          setOffline(false);
        } else {
          setOffline(true);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const items: Quote[] = useMemo(() => {
    if (quotes && quotes.length) return quotes;
    return Object.entries(TAPE_FALLBACK).map(([symbol, v]) => ({
      symbol, name: v.label, price: v.p, change: 0, changePct: 0,
    }));
  }, [quotes]);

  // for ~20 min after a scheduled pass the tape reads "upd 14:35z"; between passes it honestly reads "cache"
  const fresh = !!meta?.refreshedAt && Date.now() - meta.refreshedAt < 20 * 60 * 1000;
  const chipTip = meta
    ? `Alpha Vantage · refreshed ${hhmmz(meta.refreshedAt)} · next pass ${hhmmz(meta.nextRefreshAt)} · ${meta.callsToday ?? "?"}/${meta.dailyLimit ?? 25} calls today`
    : "no quote data from the server yet";

  const row = (keyPrefix: string) =>
    items.map((q) => {
      const label = (q as Quote & { label?: string }).label || q.name || q.symbol;
      const f = flash[q.symbol];
      return (
        <span
          key={keyPrefix + q.symbol}
          title={`${q.name || label} · ${q.change >= 0 ? "+" : ""}${q.change}`}
          className="flex items-center gap-1.5 whitespace-nowrap px-4"
        >
          <span className="font-semibold text-fog">{label}</span>
          <span className={`rounded-sm px-0.5 text-dim transition-colors duration-1000 tnum ${f === "up" ? "bg-up/20 text-up" : f === "dn" ? "bg-dn/20 text-dn" : ""}`}>
            {q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`tnum ${q.changePct >= 0 ? "text-up" : "text-dn"}`}>
            {q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
        </span>
      );
    });

  return (
    <div className="ticker relative overflow-hidden border-b border-edge bg-deep/80">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-deep pl-3 pr-8 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em]"
        style={{
          maskImage: "linear-gradient(90deg, black 68%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, black 68%, transparent)",
        }}
      >
        {offline || !quotes ? (
          <span className="flex items-center gap-1.5 text-gold" title={chipTip}>
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> delayed
          </span>
        ) : (
          <span
            className={`flex items-center gap-1.5 ${fresh ? "text-up" : "text-fog"}`}
            title={chipTip}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "pulse-dot bg-up" : "bg-fog"}`} />
            {fresh ? "upd" : "cache"} {hhmmz(meta?.refreshedAt)}
            <span className="font-normal normal-case tracking-normal text-dim">· next {hhmmz(meta?.nextRefreshAt)}</span>
          </span>
        )}
      </div>
      <div className="ticker-track flex w-max py-1.5 font-mono text-[10.5px]">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

/* ---------------- sidebar ---------------- */

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trades", label: "Trade log", icon: ListChecks },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/review", label: "Film room", icon: History },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { state, stats, mode } = useStore();
  const cur = state.settings.currency;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <Logo />
        <div>
          <div className="font-display text-[15px] font-bold leading-none tracking-tight text-snow">TapeRead</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-dim">trading journal</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-raise text-snow ring-1 ring-edge2 shadow-sm shadow-black/20"
                  : "text-fog hover:bg-raise/50 hover:text-snow"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`transition-colors ${isActive ? "text-sky" : "text-dim group-hover:text-fog"}`}>
                  <n.icon size={16} />
                </span>
                {n.label}
                {n.to === "/trades" && state.trades.length > 0 && (
                  <span className="ml-auto rounded border border-edge bg-deep px-1.5 py-0.5 font-mono text-[9.5px] text-dim tnum">
                    {state.trades.length}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 px-4 pb-5">
        <div className="rounded-md border border-edge bg-deep px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-dim">Net P&L</span>
            <span className={`h-1.5 w-1.5 rounded-full ${stats.netPnl >= 0 ? "bg-up" : "bg-dn"}`} />
          </div>
          <div className={`mt-1 font-mono text-[15px] font-semibold tnum ${pnlClass(stats.netPnl)}`}>
            <Num value={stats.netPnl} format={(n) => fmtSigned(n, cur)} />
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-dim tnum">
            {stats.total} trades · {stats.winRate.toFixed(0)}% win
          </div>
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className={`h-1.5 w-1.5 rounded-full ${mode === "server" ? "pulse-dot bg-up" : mode === "local" ? "bg-gold" : "bg-dim"}`} />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-dim">
            {mode === "server" ? "server sync · lan" : mode === "local" ? "local storage" : "connecting"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- top bar ---------------- */

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/trades": "Trade log",
  "/analytics": "Analytics",
  "/journal": "Journal",
  "/review": "Film room",
  "/settings": "Settings",
};

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { state, stats } = useStore();
  const cur = state.settings.currency;
  const loc = useLocation();
  const lastDay = stats.daily[stats.daily.length - 1];
  const balance = state.settings.startingBalance + stats.netPnl;

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-abyss/85 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button onClick={onMenu} className="rounded-md border border-edge p-2 text-fog transition-colors hover:text-snow lg:hidden" aria-label="Open menu">
          <Menu size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[16px] font-bold tracking-tight text-snow">{TITLES[loc.pathname] ?? "TapeRead"}</h1>
          <p className="hidden font-mono text-[10px] text-dim sm:block">{state.settings.accountName} · risk {state.settings.riskPerTrade}%/trade</p>
        </div>
        <div className="ml-auto flex items-center gap-4 sm:gap-6">
          <div className="hidden text-right sm:block">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-dim">Last session</div>
            {lastDay ? (
              <div className={`font-mono text-[13px] font-semibold tnum ${pnlClass(lastDay.pnl)}`}>{fmtSigned(lastDay.pnl, cur)}</div>
            ) : (
              <div className="font-mono text-[13px] text-dim">—</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-dim">Balance</div>
            <div className="font-mono text-[15px] font-semibold text-snow tnum">
              <Num value={balance} format={(n) => fmtMoney(n, cur, 0)} />
            </div>
          </div>
        </div>
      </div>
      <TickerTape />
    </header>
  );
}

/* ---------------- shell ---------------- */

function Shell() {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 z-0" aria-hidden />

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] border-r border-edge bg-deep/70 backdrop-blur-sm lg:block">
        <Sidebar />
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-abyss/70" onClick={() => setDrawer(false)} />
          <aside className="anim-pop absolute inset-y-0 left-0 w-[248px] border-r border-edge2 bg-deep shadow-2xl shadow-black/60">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-5 rounded-md p-1.5 text-fog hover:text-snow" aria-label="Close menu">
              <X size={16} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="relative z-10 lg:pl-[228px]">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/review" element={<Review />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-5 pb-2 font-mono text-[10px] text-dim">
            <span>TapeRead · self-hosted trading journal · no cloud, no telemetry</span>
            <span>data lives on your machine{` · `}press R in the film room to reveal</span>
          </footer>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
