import { useState } from "react";
import { Database, Download, HardDrive, RefreshCw, Save, Server, Trash2, Upload, Wand2 } from "lucide-react";
import { useStore } from "../store";
import { download, fmtMoney, todayISO, tradesToCSV } from "../utils";
import { BtnGhost, Confirm, Reveal, CardTitle } from "../components/ui";
import { ImportModal } from "./Trades";
import type { Settings as TSettings } from "../types";

export default function SettingsPage() {
  const { state, setSettings, loadSample, resetAll, toast, mode } = useStore();
  const [form, setForm] = useState<TSettings>({ ...state.settings });
  const [confirmSample, setConfirmSample] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const save = () => {
    if (isNaN(form.startingBalance) || form.startingBalance <= 0) {
      toast("Starting balance must be positive", "gold");
      return;
    }
    setSettings(form);
    toast("Account settings saved", "up");
  };

  const exportJSON = () => {
    download(`taperead-backup-${todayISO()}.json`, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: state }, null, 2), "application/json");
    toast("Backup downloaded", "sky");
  };

  const exportCSV = () => {
    download(`taperead-trades-${todayISO()}.csv`, tradesToCSV(state.trades), "text/csv");
    toast("CSV exported", "sky");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Reveal>
        <section className="card p-5">
          <CardTitle>Account</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">Account name</label>
              <input className="inp" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Currency</label>
              <select className="inp" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as TSettings["currency"] })}>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>
            <div>
              <label className="lbl">Starting balance ({fmtMoney(form.startingBalance || 0, form.currency, 0)})</label>
              <input type="number" className="inp font-mono" value={form.startingBalance} onChange={(e) => setForm({ ...form, startingBalance: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="lbl">Planned risk per trade (%)</label>
              <input type="number" step="0.1" className="inp font-mono" value={form.riskPerTrade} onChange={(e) => setForm({ ...form, riskPerTrade: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-up px-4 py-2 text-xs font-semibold text-abyss transition-all hover:brightness-110 active:scale-95">
              <Save size={13} /> Save settings
            </button>
          </div>
        </section>
      </Reveal>

      <Reveal delay={70}>
        <section className="card p-5">
          <CardTitle
            right={
              <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[10.5px] ${mode === "server" ? "border-up/30 bg-up/10 text-up" : "border-gold/30 bg-gold/10 text-gold"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${mode === "server" ? "pulse-dot bg-up" : "bg-gold"}`} />
                {mode === "server" ? "synced to server · shared on LAN" : mode === "local" ? "browser storage only" : "connecting…"}
              </span>
            }
          >
            Data & backups
          </CardTitle>
          <p className="mb-4 text-[12.5px] leading-relaxed text-fog">
            {mode === "server"
              ? "Your journal is saved to data.json on the host machine, so every device on the LAN sees the same book. Backups below are still smart — a CSV travels between brokers."
              : "Running without the bundled server, data lives in this browser's storage. Run server/server.js on your Linux box to share one journal across the whole LAN."}
          </p>
          <div className="flex flex-wrap gap-2">
            <BtnGhost onClick={exportJSON}><Download size={13} /> Backup JSON</BtnGhost>
            <BtnGhost onClick={exportCSV}><Download size={13} /> Export CSV</BtnGhost>
            <BtnGhost onClick={() => setImportOpen(true)}><Upload size={13} /> Import CSV</BtnGhost>
          </div>
        </section>
      </Reveal>

      <Reveal delay={120}>
        <section className="card p-5">
          <CardTitle>Danger zone</CardTitle>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-deep px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-snow"><Wand2 size={14} className="text-sky" /> Sample dataset</div>
                <p className="mt-0.5 text-[11.5px] text-fog">Replace everything with 90 days of realistic demo trades and journal entries.</p>
              </div>
              <BtnGhost onClick={() => (state.trades.length ? setConfirmSample(true) : (loadSample(), toast("Sample data loaded", "sky")))}>Load sample</BtnGhost>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dn/25 bg-dn/5 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-snow"><Trash2 size={14} className="text-dn" /> Wipe journal</div>
                <p className="mt-0.5 text-[11.5px] text-fog">Delete all trades, entries and review marks. Settings are kept.</p>
              </div>
              <BtnGhost danger onClick={() => setConfirmReset(true)}>Wipe all</BtnGhost>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={160}>
        <section className="card p-5">
          <CardTitle>Self-hosting</CardTitle>
          <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-fog">
            <li className="flex gap-2.5"><Server size={14} className="mt-0.5 shrink-0 text-sky" /> <span>Served by a zero-dependency Node script — <span className="font-mono text-[11.5px] text-sky">node server/server.js</span> on port 8090. No database, no cloud.</span></li>
            <li className="flex gap-2.5"><Database size={14} className="mt-0.5 shrink-0 text-sky" /> <span>All data persists to <span className="font-mono text-[11.5px] text-sky">server/data.json</span> on the host. Back it up with a cron copy or the JSON export above.</span></li>
            <li className="flex gap-2.5"><HardDrive size={14} className="mt-0.5 shrink-0 text-sky" /> <span>Install on any Linux box with <span className="font-mono text-[11.5px] text-sky">./install.sh</span> (optionally registers a systemd service), then open <span className="font-mono text-[11.5px] text-sky">http://&lt;server-ip&gt;:8090</span> from any LAN device.</span></li>
            <li className="flex gap-2.5"><RefreshCw size={14} className="mt-0.5 shrink-0 text-sky" /> <span>Updates: copy the new folder over, run <span className="font-mono text-[11.5px] text-sky">./install.sh --build</span> — your data.json is untouched.</span></li>
          </ul>
        </section>
      </Reveal>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <Confirm
        open={confirmSample}
        onClose={() => setConfirmSample(false)}
        onConfirm={() => {
          loadSample();
          toast("Sample data loaded", "sky");
        }}
        title="Replace with sample data?"
        body={`This overwrites your current ${state.trades.length} trades and ${state.dayNotes.length} journal entries with the demo dataset. Export a backup first if you care about them.`}
        confirmLabel="Replace"
        danger
      />
      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll();
          toast("Journal wiped", "dn");
        }}
        title="Wipe the entire journal?"
        body="Every trade, journal entry and review mark will be permanently deleted from this browser and the server file. There is no undo."
        confirmLabel="Wipe everything"
        danger
      />
    </div>
  );
}
