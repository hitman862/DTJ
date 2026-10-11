import { Activity } from "lucide-react";
import { useStore } from "../store";
import { fmtPct, fmtSigned } from "../utils";
import { CardTitle, EmptyState, Reveal, Seg, StatCard, Tag } from "../components/ui";
import { HBarList, VertBars } from "../components/charts";
import { useState } from "react";

type Tab = "setups" | "time" | "behavior";

export default function Analytics() {
  const { state, stats } = useStore();
  const cur = state.settings.currency;
  const [tab, setTab] = useState<Tab>("setups");

  if (stats.total === 0) {
    return (
      <EmptyState
        icon={<Activity size={24} />}
        title="Nothing to slice yet"
        body="Analytics unlock once trades are in the book — win rate by setup, P&L by weekday and hour, and the real cost of every behavior tag."
      />
    );
  }

  const long = stats.bySide.find((r) => r.key === "LONG");
  const short = stats.bySide.find((r) => r.key === "SHORT");

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-snow">Performance lab</h1>
            <p className="mt-0.5 text-[12.5px] text-fog">Find the three numbers that change how you trade next week.</p>
          </div>
          <Seg<Tab>
            options={[
              { value: "setups", label: "Setups" },
              { value: "time", label: "Time & days" },
              { value: "behavior", label: "Behavior" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Reveal>

      {tab === "setups" && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Best setup" tone="up" value={<span className="block truncate text-[17px]">{stats.bySetup[0]?.label || "—"}</span>} sub={stats.bySetup[0] ? fmtSigned(stats.bySetup[0].pnl, cur) : undefined} />
            <StatCard label="Worst setup" tone="dn" delay={50} value={<span className="block truncate text-[17px]">{stats.bySetup[stats.bySetup.length - 1]?.label || "—"}</span>} sub={stats.bySetup.length ? fmtSigned(stats.bySetup[stats.bySetup.length - 1].pnl, cur) : undefined} />
            <StatCard label="Long edge" tone={long && long.pnl >= 0 ? "up" : "dn"} delay={100} value={<span className="tnum">{long ? fmtSigned(long.pnl, cur) : "—"}</span>} sub={long ? `${long.count} trades · ${fmtPct(long.winRate, 0)} win` : undefined} />
            <StatCard label="Short edge" tone={short && short.pnl >= 0 ? "up" : "dn"} delay={150} value={<span className="tnum">{short ? fmtSigned(short.pnl, cur) : "—"}</span>} sub={short ? `${short.count} trades · ${fmtPct(short.winRate, 0)} win` : undefined} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Reveal>
              <section className="card p-5">
                <CardTitle>P&L by instrument</CardTitle>
                <HBarList rows={stats.byAsset} currency={cur} />
                <p className="mt-4 text-[11px] leading-relaxed text-dim">
                  Futures and options apply their contract multiplier (MNQ ×2, MCL ×100, options ×100) before fees — set it per trade in the log.
                </p>
              </section>
            </Reveal>
            <Reveal delay={80}>
              <section className="card p-5">
                <CardTitle>Options — calls vs puts</CardTitle>
                {stats.byOption.length ? (
                  <HBarList rows={stats.byOption} currency={cur} />
                ) : (
                  <p className="py-8 text-center text-xs text-dim">No option trades logged yet.</p>
                )}
              </section>
            </Reveal>
          </div>
          <Reveal>
            <section className="card p-5">
              <CardTitle>Setup breakdown — where the money actually comes from</CardTitle>
              <HBarList rows={stats.bySetup} currency={cur} />
            </section>
          </Reveal>
        </>
      )}

      {tab === "time" && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Reveal>
              <section className="card p-5">
                <CardTitle>P&L by weekday</CardTitle>
                <VertBars rows={stats.byWeekday} currency={cur} label="bar = net P&L · number below = win rate" />
              </section>
            </Reveal>
            <Reveal delay={80}>
              <section className="card p-5">
                <CardTitle>P&L by entry hour</CardTitle>
                <VertBars rows={stats.byHour} currency={cur} label="bar = net P&L · number below = win rate" />
              </section>
            </Reveal>
          </div>
          <Reveal>
            <section className="card p-5">
              <CardTitle>Weekday detail</CardTitle>
              <HBarList rows={stats.byWeekday} currency={cur} />
            </section>
          </Reveal>
        </>
      )}

      {tab === "behavior" && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Reveal>
              <section className="card p-5">
                <CardTitle>Cost of each behavior tag</CardTitle>
                <HBarList rows={stats.byTag} currency={cur} />
                <p className="mt-4 text-[11px] leading-relaxed text-dim">
                  Tags marked on losing executions quantify exactly how much each mistake costs. Anything red above −{`$0`} is a rule candidate for your trading plan.
                </p>
              </section>
            </Reveal>
            <Reveal delay={80}>
              <section className="card p-5">
                <CardTitle>P&L by emotional state</CardTitle>
                <HBarList rows={stats.byEmotion} currency={cur} />
                <div className="mt-5 rounded-md border border-edge bg-deep px-4 py-3">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.15em] text-dim">Plan adherence</div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-2xl font-bold text-sky tnum">{stats.planRate == null ? "—" : fmtPct(stats.planRate, 0)}</span>
                    <span className="text-xs text-fog">of decided trades followed the plan</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11.5px] tnum">
                    <span className={stats.planPnlFollowed >= 0 ? "text-up" : "text-dn"}>followed · {fmtSigned(stats.planPnlFollowed, cur)}</span>
                    <span className={stats.planPnlBroken >= 0 ? "text-up" : "text-dn"}>broken · {fmtSigned(stats.planPnlBroken, cur)}</span>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>
          <Reveal>
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-dim">Streaks:</span>
              <Tag tone="up">best win streak · {stats.bestWinStreak}</Tag>
              <Tag tone="dn">worst loss streak · {stats.worstLossStreak}</Tag>
              {stats.curStreak && <Tag tone={stats.curStreak.kind === "win" ? "up" : "dn"}>current · {stats.curStreak.n} {stats.curStreak.kind}</Tag>}
              <Tag tone="fog">green days · {stats.greenDays}</Tag>
              <Tag tone="fog">red days · {stats.redDays}</Tag>
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
}
