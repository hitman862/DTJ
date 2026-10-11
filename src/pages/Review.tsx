import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, History, RotateCcw, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { contractLabel, fmtDateNice, fmtPrice, fmtSigned, sortTrades } from "../utils";
import { AssetBadge, BtnGhost, EmptyState, PlanMark, Reveal, Seg, SideBadge, Tag, pnlClass } from "../components/ui";

type Pool = "all" | "losses" | "mistakes";

export default function Review() {
  const { state, toggleReviewed, updateTrade, toast } = useStore();
  const cur = state.settings.currency;
  const [pool, setPool] = useState<Pool>("mistakes");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const trades = useMemo(() => {
    let list = sortTrades(state.trades).reverse();
    if (pool === "losses") list = list.filter((t) => t.pnl < 0);
    if (pool === "mistakes") list = list.filter((t) => !t.followedPlan || t.tags.length > 0);
    // unreviewed first, keep chronological inside each group
    return [...list.filter((t) => !state.reviewed.includes(t.id)), ...list.filter((t) => state.reviewed.includes(t.id))];
  }, [state.trades, state.reviewed, pool]);

  const trade = trades[Math.min(idx, trades.length - 1)];
  const reviewedInPool = trades.filter((t) => state.reviewed.includes(t.id)).length;

  useEffect(() => {
    setIdx(0);
    setRevealed(false);
  }, [pool, state.trades.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "r" || e.key === "R") setRevealed(true);
      if (e.key === "n" || e.key === "N" || e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const next = () => {
    setRevealed(false);
    setIdx((i) => (trades.length ? (i + 1) % trades.length : 0));
  };
  const prev = () => {
    setRevealed(false);
    setIdx((i) => (trades.length ? (i - 1 + trades.length) % trades.length : 0));
  };

  if (state.trades.length === 0) {
    return (
      <EmptyState
        icon={<History size={24} />}
        title="Review mode needs history"
        body="Log trades first — then replay them here blind: study the setup and your notes before revealing the outcome, exactly like a post-session film room."
      />
    );
  }

  const isReviewed = trade && state.reviewed.includes(trade.id);
  const progress = trades.length ? Math.round((reviewedInPool / trades.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-snow">Film room</h1>
            <p className="mt-0.5 text-[12.5px] text-fog">
              Study the setup blind, then reveal the result. <span className="font-mono text-[11px] text-dim">[R] reveal · [N] next · [←/→] navigate</span>
            </p>
          </div>
          <Seg<Pool>
            options={[
              { value: "all", label: "All" },
              { value: "losses", label: "Losses" },
              { value: "mistakes", label: "Mistakes" },
            ]}
            value={pool}
            onChange={setPool}
          />
        </div>
      </Reveal>

      <Reveal delay={70}>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <span className="font-mono text-[11px] text-fog tnum">
              card {trades.length ? Math.min(idx, trades.length - 1) + 1 : 0} / {trades.length}
            </span>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-36 overflow-hidden rounded-full bg-deep">
                <div className="h-full rounded-full bg-sky transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="font-mono text-[10.5px] text-dim tnum">{progress}% reviewed</span>
            </div>
          </div>

          {!trade ? (
            <p className="px-5 py-14 text-center text-sm text-dim">Nothing in this pool — switch filters above.</p>
          ) : (
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-2xl font-bold text-snow">{contractLabel(trade)}</span>
                  <SideBadge side={trade.side} />
                  <AssetBadge ac={trade.assetClass} />
                  {isReviewed && (
                    <span className="inline-flex items-center gap-1 rounded border border-sky/30 bg-sky/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky">
                      <CheckCircle2 size={11} /> reviewed
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11.5px] text-fog">
                  {fmtDateNice(trade.date)} · {trade.entryTime}
                  {trade.exitTime ? ` → ${trade.exitTime}` : ""}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-md border border-edge bg-deep px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-dim">Setup</div>
                  <div className="mt-0.5 truncate text-[12px] font-medium text-snow">{trade.setup || "—"}</div>
                </div>
                <div className="rounded-md border border-edge bg-deep px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-dim">Size</div>
                  <div className="mt-0.5 font-mono text-[12px] text-snow tnum">{trade.qty} @ {fmtPrice(trade.entryPrice)}</div>
                </div>
                <div className="rounded-md border border-edge bg-deep px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-dim">Emotion</div>
                  <div className="mt-0.5 text-[12px] text-snow">{trade.emotions.join(", ") || "—"}</div>
                </div>
                <div className="rounded-md border border-edge bg-deep px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-dim">Plan</div>
                  <div className="mt-1"><PlanMark v={trade.followedPlan} /></div>
                </div>
              </div>

              {trade.notes && (
                <blockquote className="mt-4 rounded-md border-l-2 border-sky bg-deep px-4 py-3 text-[12.5px] italic leading-relaxed text-fog">
                  “{trade.notes}”
                </blockquote>
              )}
              {trade.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {trade.tags.map((t) => (
                    <Tag key={t} tone={/chased|moved|over|revenge|early|gamble|no setup/i.test(t) ? "dn" : "up"}>{t}</Tag>
                  ))}
                </div>
              )}

              {/* outcome */}
              <div className="mt-5 rounded-md border border-edge bg-abyss/60 px-4 py-4">
                {revealed ? (
                  <div className="anim-unblur flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-dim">Outcome</div>
                      <div className={`font-display text-3xl font-bold tnum ${pnlClass(trade.pnl)}`}>{fmtSigned(trade.pnl, cur)}</div>
                    </div>
                    <div className="text-right font-mono text-[12px] text-fog tnum">
                      exit @ {fmtPrice(trade.exitPrice)}
                      {trade.rMultiple != null && (
                        <>
                          <br />
                          <span className={pnlClass(trade.rMultiple)}>{trade.rMultiple > 0 ? "+" : ""}{trade.rMultiple.toFixed(2)}R</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevealed(true)}
                    className="group flex w-full items-center justify-center gap-2 py-2 font-mono text-[12px] text-dim transition-colors hover:text-sky"
                  >
                    <span className="select-none blur-[6px] transition-all group-hover:blur-[4px]">{fmtSigned(trade.pnl, cur)} · {trade.rMultiple?.toFixed(2) ?? "–"}R</span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-sky/40 bg-sky/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky">
                      <Eye size={12} /> Reveal outcome
                    </span>
                  </button>
                )}
              </div>

              {/* actions */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
                {revealed && (
                  <>
                    <span className="mr-1 text-[11px] uppercase tracking-widest text-dim">Followed plan?</span>
                    <button
                      onClick={() => {
                        updateTrade({ ...trade, followedPlan: true });
                        toast("Marked as plan-followed", "up");
                      }}
                      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${trade.followedPlan === true ? "border-up/50 bg-up/15 text-up" : "border-edge text-fog hover:border-edge2"}`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => {
                        updateTrade({ ...trade, followedPlan: false });
                        toast("Marked as rule-break", "dn");
                      }}
                      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${trade.followedPlan === false ? "border-dn/50 bg-dn/15 text-dn" : "border-edge text-fog hover:border-edge2"}`}
                    >
                      No
                    </button>
                  </>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <BtnGhost onClick={prev}><ChevronLeft size={13} /></BtnGhost>
                  <button
                    onClick={() => {
                      toggleReviewed(trade.id);
                      toast(isReviewed ? "Removed from reviewed" : "Marked reviewed", "sky");
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold transition-all active:scale-95 ${
                      isReviewed ? "border-sky/50 bg-sky/15 text-sky" : "border-edge text-fog hover:border-edge2 hover:text-snow"
                    }`}
                  >
                    <RotateCcw size={12} /> {isReviewed ? "Reviewed" : "Mark reviewed"}
                  </button>
                  <button onClick={next} className="inline-flex items-center gap-1.5 rounded-md bg-raise px-3.5 py-2 text-[11px] font-semibold text-snow ring-1 ring-edge2 transition-all hover:bg-hover active:scale-95">
                    Next <SkipForward size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      <Reveal delay={120}>
        <button onClick={() => setIdx(Math.floor(Math.random() * Math.max(1, trades.length)))} className="mx-auto flex items-center gap-1.5 font-mono text-[11px] text-dim transition-colors hover:text-sky">
          <ChevronRight size={12} /> shuffle the deck
        </button>
      </Reveal>
    </div>
  );
}
