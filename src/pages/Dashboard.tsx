import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarDays,
  Clock3,
  Flame,
  BookOpen,
  Layers,
  Percent,
  Repeat,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Upload,
  Wallet,
  Wand2,
} from "lucide-react";
import { useStore } from "../store";
import { buildInsights, contractLabel, fmtMoney, fmtPct, fmtSigned, fmtDateShort, sortTrades } from "../utils";
import { AssetBadge, Donut, EmptyState, Num, PlanMark, Reveal, SideBadge, StatCard, Tag, toneText, pnlClass } from "../components/ui";
import { CalendarHeatmap, DailyBars, EquityChart } from "../components/charts";
import type { AssetClass, Insight } from "../types";
import type { ReactNode } from "react";

const ICONS: Record<Insight["icon"], ReactNode> = {
  calendar: <CalendarDays size={15} />,
  clock: <Clock3 size={15} />,
  repeat: <Repeat size={15} />,
  shield: <ShieldCheck size={15} />,
  flame: <Flame size={15} />,
  target: <Target size={15} />,
  brain: <Brain size={15} />,
  alert: <AlertTriangle size={15} />,
  layers: <Layers size={15} />,
};

export default function Dashboard() {
  const { state, stats, loadSample, toast } = useStore();
  const cur = state.settings.currency;

  if (stats.total === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={24} />}
        title="Your trade book is empty"
        body="Log your first execution, import a CSV export from your broker, or load three months of realistic sample data to see every chart and insight in action."
      >
        <button
          onClick={() => {
            loadSample();
            toast("Loaded 90 days of sample trades", "sky");
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-up px-4 py-2 text-xs font-semibold text-abyss transition-all hover:brightness-110 active:scale-95"
        >
          <Wand2 size={14} /> Load sample data
        </button>
        <Link to="/trades" className="inline-flex items-center gap-1.5 rounded-md border border-edge px-4 py-2 text-xs font-medium text-fog transition-colors hover:border-edge2 hover:text-snow">
          <Upload size={14} /> Import / add trades
        </Link>
      </EmptyState>
    );
  }

  const insights = buildInsights(stats);
  const lastDay = stats.daily[stats.daily.length - 1];
  const balance = state.settings.startingBalance + stats.netPnl;
  const recent = sortTrades(state.trades).slice(-7).reverse();
  const bestSetup = stats.bySetup[0];
  const worstWd = stats.byWeekday.filter((r) => r.count >= 2).sort((a, b) => a.pnl - b.pnl)[0];
  const pf = stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);

  return (
    <div className="space-y-5">
      {/* stat strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Net P&L"
          tone={stats.netPnl >= 0 ? "up" : "dn"}
          icon={stats.netPnl >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          value={<Num value={stats.netPnl} format={(n) => fmtSigned(n, cur)} />}
          sub={`${stats.greenDays} green / ${stats.redDays} red days`}
        />
        <StatCard label="Win rate" tone="sky" icon={<Percent size={15} />} delay={50} value={<Num value={stats.winRate} format={(n) => fmtPct(n)} />} sub={`${stats.wins}W · ${stats.losses}L`} />
        <StatCard label="Profit factor" tone="gold" icon={<Trophy size={15} />} delay={100} value={<span className="tnum">{pf}</span>} sub={`${fmtMoney(stats.grossWin, cur, 0)} / ${fmtMoney(stats.grossLoss, cur, 0)}`} />
        <StatCard label="Expectancy" tone={stats.expectancy >= 0 ? "up" : "dn"} icon={<Target size={15} />} delay={150} value={<Num value={stats.expectancy} format={(n) => fmtSigned(n, cur)} />} sub="per trade" />
        <StatCard
          label="Avg R"
          tone={(stats.avgR ?? 0) >= 0 ? "up" : "dn"}
          icon={<Repeat size={15} />}
          delay={200}
          value={<span className="tnum">{stats.avgR == null ? "—" : `${stats.avgR > 0 ? "+" : ""}${stats.avgR.toFixed(2)}R`}</span>}
          sub={stats.curStreak ? `streak: ${stats.curStreak.n} ${stats.curStreak.kind}` : "no streak"}
        />
        <StatCard label="Balance" tone="fog" icon={<Wallet size={15} />} delay={250} value={<Num value={balance} format={(n) => fmtMoney(n, cur, 0)} />} sub={`start ${fmtMoney(state.settings.startingBalance, cur, 0)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* equity */}
        <Reveal className="xl:col-span-2">
          <section className="card p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[15px] font-semibold text-snow">Equity curve</h2>
              <span className={`font-mono text-xs tnum ${pnlClass(stats.netPnl)}`}>
                {fmtSigned(stats.netPnl, cur)} · {fmtPct((stats.netPnl / state.settings.startingBalance) * 100)}
              </span>
            </div>
            <p className="mb-3 text-[11px] text-dim">cumulative account value · red trace = drawdown from peak</p>
            <EquityChart points={stats.equity} starting={state.settings.startingBalance} currency={cur} />
          </section>
        </Reveal>

        {/* right rail */}
        <div className="space-y-5">
          <Reveal delay={80}>
            <section className="card p-5">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-snow">Last session</h2>
              {lastDay ? (
                <>
                  <div className={`font-display text-3xl font-bold tnum ${pnlClass(lastDay.pnl)}`}>{fmtSigned(lastDay.pnl, cur)}</div>
                  <div className="mt-1 text-xs text-fog">
                    {lastDay.date} · {lastDay.count} trade{lastDay.count === 1 ? "" : "s"}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11.5px]">
                    <div className="rounded-md border border-edge bg-deep px-3 py-2">
                      <div className="text-dim">Best trade</div>
                      <div className={`mt-0.5 font-mono font-semibold tnum ${pnlClass(stats.bestTrade?.pnl ?? 0)}`}>{stats.bestTrade ? fmtSigned(stats.bestTrade.pnl, cur) : "—"}</div>
                    </div>
                    <div className="rounded-md border border-edge bg-deep px-3 py-2">
                      <div className="text-dim">Worst trade</div>
                      <div className={`mt-0.5 font-mono font-semibold tnum ${pnlClass(-(stats.worstTrade?.pnl ?? 0))}`}>{stats.worstTrade ? fmtSigned(stats.worstTrade.pnl, cur) : "—"}</div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-dim">No sessions logged.</p>
              )}
            </section>
          </Reveal>

          <Reveal delay={140}>
            <section className="card flex items-center gap-5 p-5">
              <Donut pct={stats.planRate ?? 0} color="var(--color-sky)" label={stats.planRate == null ? "—" : fmtPct(stats.planRate, 0)} sublabel="plan kept" />
              <div className="min-w-0 text-[12px] leading-relaxed text-fog">
                <div className="mb-1.5 font-display text-[13px] font-semibold text-snow">Discipline score</div>
                <span className={pnlClass(stats.planPnlFollowed)}>followed → {fmtSigned(stats.planPnlFollowed, cur)}</span>
                <br />
                <span className={pnlClass(stats.planPnlBroken)}>broken → {fmtSigned(stats.planPnlBroken, cur)}</span>
              </div>
            </section>
          </Reveal>

          <Reveal delay={200}>
            <section className="card space-y-3 p-5">
              <h2 className="font-display text-[15px] font-semibold text-snow">Standouts</h2>
              {bestSetup && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-up/20 bg-up/6 px-3 py-2.5">
                  <span className="truncate text-xs text-fog">Top setup · <span className="text-snow">{bestSetup.label}</span></span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-up tnum">{fmtSigned(bestSetup.pnl, cur)}</span>
                </div>
              )}
              {worstWd && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-dn/20 bg-dn/6 px-3 py-2.5">
                  <span className="truncate text-xs text-fog">Worst weekday · <span className="text-snow">{worstWd.label}</span></span>
                  <span className={`shrink-0 font-mono text-xs font-semibold tnum ${pnlClass(worstWd.pnl)}`}>{fmtSigned(worstWd.pnl, cur)}</span>
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={260}>
            <section className="card p-5">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-snow">Instruments</h2>
              <div className="space-y-2">
                {stats.byAsset.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3 rounded-md border border-edge bg-deep px-3 py-2.5 transition-colors hover:border-edge2">
                    <span className="flex items-center gap-2 text-xs text-fog">
                      <AssetBadge ac={r.key as AssetClass} />
                      {r.label}
                      <span className="text-dim">· {r.count}</span>
                    </span>
                    <span className={`font-mono text-xs font-semibold tnum ${pnlClass(r.pnl)}`}>{fmtSigned(r.pnl, cur)}</span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        </div>
      </div>

      {/* insights */}
      {insights.length > 0 && (
        <Reveal>
          <section className="card p-5">
            <h2 className="mb-4 font-display text-[15px] font-semibold text-snow">
              What the tape is telling you
              <span className="ml-2 rounded border border-edge bg-deep px-1.5 py-0.5 font-mono text-[10px] font-normal text-fog">{insights.length} signals</span>
            </h2>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {insights.map((ins, i) => (
                <li key={i} className={`flex items-start gap-3 rounded-md border border-edge bg-deep px-3.5 py-3 transition-colors hover:border-edge2 ${toneText[ins.tone]}`}>
                  <span className="mt-0.5 shrink-0">{ICONS[ins.icon]}</span>
                  <span className="text-[12.5px] leading-relaxed text-fog">{ins.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {/* daily bars + calendar */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Reveal>
          <section className="card p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="font-display text-[15px] font-semibold text-snow">Daily P&L</h2>
              <span className="font-mono text-[10.5px] text-dim">last {Math.min(24, stats.daily.length)} sessions</span>
            </div>
            <DailyBars days={stats.daily} currency={cur} />
          </section>
        </Reveal>
        <Reveal delay={90}>
          <section className="card p-5">
            <h2 className="mb-4 font-display text-[15px] font-semibold text-snow">Consistency calendar</h2>
            <CalendarHeatmap daily={stats.daily} currency={cur} />
          </section>
        </Reveal>
      </div>

      {/* recent trades */}
      <Reveal>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
            <h2 className="font-display text-[15px] font-semibold text-snow">Recent executions</h2>
            <Link to="/trades" className="inline-flex items-center gap-1 text-xs font-medium text-sky transition-colors hover:text-snow">
              Full log <ArrowRight size={13} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-edge text-[10.5px] uppercase tracking-[0.13em] text-dim">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Symbol</th>
                  <th className="px-3 py-2.5 font-medium">Setup</th>
                  <th className="px-3 py-2.5 font-medium">Plan</th>
                  <th className="px-3 py-2.5 font-medium">R</th>
                  <th className="px-5 py-2.5 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-edge/60 transition-colors last:border-0 hover:bg-raise/50">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[11.5px] text-fog">{fmtDateShort(t.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-snow">
                        {contractLabel(t)} <SideBadge side={t.side} /> <AssetBadge ac={t.assetClass} />
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-fog">{t.setup || "—"}</td>
                    <td className="px-3 py-2.5"><PlanMark v={t.followedPlan} /></td>
                    <td className={`px-3 py-2.5 font-mono tnum ${pnlClass(t.rMultiple ?? 0)}`}>{t.rMultiple == null ? "—" : `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple.toFixed(1)}R`}</td>
                    <td className={`whitespace-nowrap px-5 py-2.5 text-right font-mono font-semibold tnum ${pnlClass(t.pnl)}`}>{fmtSigned(t.pnl, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      {stats.byTag.length > 0 && (
        <Reveal>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-dim">Behavior tags:</span>
            {stats.byTag.slice(0, 8).map((t) => (
              <Tag key={t.key} tone={t.pnl < 0 ? "dn" : "up"}>
                {t.label} · {fmtSigned(t.pnl, cur)}
              </Tag>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
