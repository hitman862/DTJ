import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Save, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "../store";
import { contractLabel, fmtDateNice, fmtSigned, sortTrades, timeAgo, todayISO } from "../utils";
import { BtnGhost, Confirm, EmptyState, PlanMark, Reveal, Seg, SideBadge, pnlClass } from "../components/ui";

const MOODS = [
  { v: 1, label: "Rough", color: "#ff6472" },
  { v: 2, label: "Tense", color: "#f2884b" },
  { v: 3, label: "Neutral", color: "#8ba0c6" },
  { v: 4, label: "Good", color: "#5aa2ff" },
  { v: 5, label: "Sharp", color: "#3ddc97" },
];

export default function Journal() {
  const { state, upsertNote, deleteNote, toast } = useStore();
  const cur = state.settings.currency;
  const [date, setDate] = useState(todayISO());
  const [mood, setMood] = useState<number>(3);
  const [plan, setPlan] = useState<"yes" | "no" | "na">("na");
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const existing = state.dayNotes.find((n) => n.date === date) ?? null;

  useEffect(() => {
    setMood(existing?.mood ?? 3);
    setPlan(existing ? (existing.followedPlan == null ? "na" : existing.followedPlan ? "yes" : "no") : "na");
    setText(existing?.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, state.dayNotes.length]);

  const dayTrades = useMemo(() => sortTrades(state.trades.filter((t) => t.date === date)), [state.trades, date]);
  const dayPnl = dayTrades.reduce((s, t) => s + t.pnl, 0);

  const shiftDay = (d: number) => {
    const dt = new Date(date + "T12:00:00");
    dt.setDate(dt.getDate() + d);
    setDate(format(dt, "yyyy-MM-dd"));
  };

  const save = () => {
    if (!text.trim() && plan === "na") {
      toast("Write a note or mark the plan first", "gold");
      return;
    }
    upsertNote({ date, mood, followedPlan: plan === "na" ? null : plan === "yes", text: text.trim() });
    toast(existing ? "Entry updated" : "Entry saved", "up");
  };

  const moodOf = (m: number) => MOODS.find((x) => x.v === m) ?? MOODS[2];
  const sortedNotes = useMemo(() => [...state.dayNotes].sort((a, b) => b.date.localeCompare(a.date)), [state.dayNotes]);

  if (state.trades.length === 0 && state.dayNotes.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={24} />}
        title="The tape remembers — your notes explain why"
        body="After each session, capture the mood, whether the plan was followed, and what the market did. Entries pair automatically with that day's trades."
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* editor */}
      <Reveal className="lg:col-span-3">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => shiftDay(-1)} className="rounded-md border border-edge p-1.5 text-fog transition-colors hover:border-edge2 hover:text-snow" aria-label="Previous day">
                <ChevronLeft size={14} />
              </button>
              <input type="date" className="inp w-auto py-1.5 font-mono text-xs" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button onClick={() => shiftDay(1)} className="rounded-md border border-edge p-1.5 text-fog transition-colors hover:border-edge2 hover:text-snow" aria-label="Next day">
                <ChevronRight size={14} />
              </button>
            </div>
            {existing && <span className="rounded border border-sky/30 bg-sky/10 px-2 py-0.5 font-mono text-[10px] text-sky">editing saved entry</span>}
          </div>

          <h2 className="font-display text-lg font-semibold text-snow">{fmtDateNice(date)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-fog">
            <span>{dayTrades.length} trade{dayTrades.length === 1 ? "" : "s"}</span>
            <span className={`font-mono font-semibold tnum ${pnlClass(dayPnl)}`}>{fmtSigned(dayPnl, cur)}</span>
            {dayTrades.length > 0 && <span className="font-mono text-[11px] text-dim">{dayTrades[0].entryTime} – {dayTrades[dayTrades.length - 1].exitTime || "…"}</span>}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">Session mood</label>
              <div className="flex gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setMood(m.v)}
                    title={m.label}
                    className={`flex-1 rounded-md border px-1 py-2 text-[10.5px] font-semibold transition-all ${
                      mood === m.v ? "border-transparent text-abyss" : "border-edge bg-deep text-fog hover:border-edge2"
                    }`}
                    style={mood === m.v ? { backgroundColor: m.color } : undefined}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">Followed the plan?</label>
              <div className="pt-1">
                <Seg
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "na", label: "—" },
                  ]}
                  value={plan}
                  onChange={setPlan}
                />
              </div>
            </div>
          </div>

          <label className="lbl mt-5">Session debrief</label>
          <textarea
            className="inp min-h-[150px] resize-y leading-relaxed"
            placeholder="What did the market do? What did you do? What's the one thing to repeat tomorrow — and the one thing to stop?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="mt-4 flex items-center justify-between">
            {existing ? (
              <BtnGhost danger onClick={() => setConfirmDel(true)}>
                <Trash2 size={13} /> Delete entry
              </BtnGhost>
            ) : (
              <span />
            )}
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-up px-4 py-2 text-xs font-semibold text-abyss transition-all hover:brightness-110 active:scale-95">
              <Save size={14} /> {existing ? "Update entry" : "Save entry"}
            </button>
          </div>
        </section>

        {/* day's trades */}
        {dayTrades.length > 0 && (
          <section className="card mt-5 overflow-hidden">
            <div className="border-b border-edge px-5 py-3">
              <h3 className="font-display text-[13.5px] font-semibold text-snow">Executions this day</h3>
            </div>
            <ul>
              {dayTrades.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-edge/60 px-5 py-2.5 text-[12px] transition-colors last:border-0 hover:bg-raise/50">
                  <span className="font-mono text-[11px] text-dim">{t.entryTime}</span>
                  <span className="font-semibold text-snow">{contractLabel(t)}</span>
                  <SideBadge side={t.side} />
                  <span className="hidden truncate text-fog sm:block">{t.setup || "—"}</span>
                  <PlanMark v={t.followedPlan} />
                  <span className={`ml-auto font-mono font-semibold tnum ${pnlClass(t.pnl)}`}>{fmtSigned(t.pnl, cur)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Reveal>

      {/* history */}
      <Reveal delay={90} className="lg:col-span-2">
        <section className="card p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold text-snow">
            Past entries <span className="ml-1 rounded border border-edge bg-deep px-1.5 py-0.5 font-mono text-[10px] font-normal text-fog">{sortedNotes.length}</span>
          </h2>
          {sortedNotes.length === 0 && <p className="py-8 text-center text-xs text-dim">No entries yet — save your first debrief on the left.</p>}
          <ul className="space-y-2.5">
            {sortedNotes.map((n) => {
              const m = moodOf(n.mood);
              const active = n.date === date;
              return (
                <li key={n.date}>
                  <button
                    onClick={() => setDate(n.date)}
                    className={`w-full rounded-md border px-3.5 py-3 text-left transition-all hover:border-edge2 ${
                      active ? "border-sky/40 bg-sky/6" : "border-edge bg-deep"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-fog">{fmtDateNice(n.date)} <span className="text-dim">· {timeAgo(n.date)}</span></span>
                      <span className="flex items-center gap-2">
                        <PlanMark v={n.followedPlan} />
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-abyss" style={{ backgroundColor: m.color }}>
                          {m.label}
                        </span>
                      </span>
                    </div>
                    {n.text && <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-fog">{n.text}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </Reveal>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteNote(date);
          toast("Entry deleted", "dn");
        }}
        title="Delete journal entry"
        body={`Remove the debrief for ${fmtDateNice(date)}? Trades from that day are not affected.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
