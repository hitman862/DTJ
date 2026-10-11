# TapeRead — self-hosted day trading journal

A TradeZella-style journal that runs entirely on your own machine: trade log,
equity analytics, psychology journal, and a blind "film room" review mode.
No cloud, no account, no telemetry — designed for a Linux box on a LAN.

## Features

- **Dashboard** — net P&L, win rate, profit factor, expectancy, avg R, equity
  curve with drawdown trace, daily P&L bars, consistency calendar heatmap,
  discipline score, and auto-generated insights ("Mondays are bleeding you…").
- **Trade log** — manual entry with live P&L preview, behavior tags, emotions,
  plan adherence, notes; search/filter/sort, multi-select delete, CSV
  import/export (broker-agnostic template included).
- **Analytics** — P&L and win rate by setup, weekday, entry hour; the dollar
  cost of every behavior tag and emotional state; long/short split; streaks.
- **Journal** — per-day debriefs with mood, plan adherence, and the day's
  executions attached automatically.
- **Film room** — replay trades blind: study the setup and your notes, reveal
  the outcome, re-grade plan adherence, track review progress. Keyboard:
  `R` reveal · `N` next · `←/→` navigate.
- **LAN sync** — when served with the bundled server, the whole journal
  persists to `server/data.json`, so every device on the network shares one
  book. Without it, data falls back to browser localStorage.

## Install on your Linux server

Requirements: Node.js 18+ (the installer will fetch it via apt if missing).

```bash
# 1. copy this folder to the server, then:
chmod +x install.sh
./install.sh                 # builds dist/ if needed
./install.sh --service       # optional: register + start a systemd service

# 2. start (if you didn't use --service)
node server/server.js        # PORT=9000 node server/server.js to change port
```

Then open **http://<server-ip>:8090** from any device on the LAN. The server
prints the LAN address on startup. If clients can't connect, open the port:

```bash
sudo ufw allow 8090/tcp
```

To restrict to LAN only (the default listen is `0.0.0.0`), either rely on your
router/firewall not exposing the port, or bind a firewall rule limiting 8090
to your subnet, e.g. `sudo ufw allow from 192.168.1.0/24 to any port 8090`.

## Portable package / reinstall on another box

From the project folder, run:

```bash
chmod +x package.sh
./package.sh                 # produces taperead-<version>.tar.gz
```

The tarball contains only what's needed to run — prebuilt `dist/`, the
zero-dependency server, installer, updater, docs (no sources, no data, no
`node_modules`). Install on any Linux instance:

```bash
scp taperead-1.2.0.tar.gz user@newbox:~/
tar xzf taperead-1.2.0.tar.gz && cd taperead-1.2.0
./install.sh --service       # installs Node via apt/dnf/yum/pacman if missing
```

**Migrate your existing journal** (do this before the first start, or copy
over later and restart the service):

```bash
scp oldbox:/path/taperead/server/data.json taperead-1.2.0/server/
# optional, so the tape doesn't re-fetch: server/quotes-cache.json too
```

The installer works without npm or internet for the app itself — only the
Node.js package (fetched once from your distro's repos) is downloaded.

## Data & backups

| What | Where |
|---|---|
| Journal (all devices) | `server/data.json` on the host |
| Tape cache | `server/quotes-cache.json` (rebuilds itself on the next pass) |
| Per-browser fallback | localStorage key `taperead.v1` |

### Live market tape (Alpha Vantage)

The top ticker shows real prices from [Alpha Vantage] via the server's
`GET /api/quotes` endpoint — the API key lives **only in `server/server.js`**
(override with the `ALPHAVANTAGE_KEY` env var) and never reaches the browser.

Tape: S&P 500 (SPX), Nasdaq (IXIC), Dow (DJI), VIX, SPY, QQQ, crude (USO),
gold (GLD), AAPL, NVDA, TSLA, BTC/USD. Futures are shown through their ETF
proxies since Alpha Vantage has no futures feed (ES→SPY, NQ→QQQ, CL→USO,
GC→GLD); micro contracts (MNQ, MES, MCL…) track the same underlying.

Because the free tier allows **25 calls/day at 5/min**, the server refreshes
on a schedule instead of continuously:

| Setting | Default | Meaning |
|---|---|---|
| `AV_SLOTS` | `14:35,21:15` | UTC refresh times (10:35 ET after the open settles, 17:15 ET after the close) |
| `AV_DAILY_LIMIT` | `25` | hard daily call budget; when hit, the tape keeps serving the cache |

During a pass it paces one call every 6.5 s (~80 s for all 12 symbols) and
persists results to `server/quotes-cache.json`, so service restarts never
blank the tape. On weekends a single 21:15 UTC pass keeps BTC fresh. The chip
left of the tape tells you exactly when the data was refreshed and when the
next pass runs (hover for the day's call budget). If the host has no internet
the tape falls back to seeds, clearly marked **DELAYED**.

Set the systemd unit's environment to change the schedule, e.g.
`Environment=AV_SLOTS=14:35,21:15` in `/etc/systemd/system/taperead.service`
(then `systemctl daemon-reload && systemctl restart taperead`). A premium
Alpha Vantage key can run much more often — lower the slot interval and raise
`AV_DAILY_LIMIT` accordingly.

[Alpha Vantage]: https://www.alphavantage.co

- **Settings → Data & backups** exports a full JSON backup or a broker-style CSV.
- A nightly cron copy of `server/data.json` is all the backup you need:
  `0 3 * * * cp /path/to/server/data.json /backups/taperead-$(date +\%F).json`

## CSV format

Header (all optional except `symbol`, `date`, `qty`, `entryPrice`, `exitPrice`):

```
symbol,assetClass,optionType,strike,expiry,multiplier,side,date,entryTime,exitTime,qty,entryPrice,exitPrice,fees,rMultiple,setup,tags,emotions,followedPlan,notes
```

- `assetClass`: STOCK / OPTION / FUTURES (blank = STOCK)
- `optionType`: CALL / PUT · `strike`, `expiry`: options only
- `multiplier`: $ per point — stocks ×1, options ×100, futures per contract
  (MNQ ×2, MES ×5, MCL ×100, MGC ×10…). Blank = looked up automatically.
- `side`: LONG/SHORT · `date`: yyyy-MM-dd · times: HH:mm
- `tags` / `emotions`: pipe-separated (`Moved stop|Oversized`)
- `followedPlan`: yes/no/blank · P&L is recalculated on import using the multiplier.

Download a ready template from **Trade log → Import → Download template**.

## Multi-asset: stocks, options, futures

Every trade carries an **instrument type** and a **point multiplier**:

| Instrument | Multiplier | P&L formula |
|---|---|---|
| Stock | ×1 | (exit − entry) × qty × 1 − fees |
| Option (CALL/PUT) | ×100 / contract | (exit − entry premium) × contracts × 100 − fees |
| Futures | per contract spec | (exit − entry) × contracts × $/pt − fees |

Futures symbols auto-fill $/point (NQ ×20, MNQ ×2, ES ×50, MES ×5, M2K ×5,
MYM ×0.5, RTY ×50, CL ×1000, MCL ×100, NG ×10000, GC ×100, MGC ×10, SI ×5000,
SIL ×1000, ZN/ZB ×1000, 6E ×125k, M6E ×12.5k, 6B ×62.5k…) and you can override
it per trade. Options are logged as *AAPL 190C 01/17* style contracts with
strike + expiry. Analytics breaks P&L down by instrument and calls vs puts.

Old journal data migrates automatically: existing rows are treated as stocks
(their stored P&L is never changed).

## Updating an existing install

From the folder containing the **new** version:

```bash
chmod +x update.sh
./update.sh /path/to/taperead-install   # or just ./update.sh if already in place
```

The updater backs up `server/data.json` to a timestamped `.bak` file, replaces
`dist/` + server files, and restarts the `taperead` systemd service (or tells
you how to restart manually). **Your journal is never overwritten.** To roll
back, restore the latest `data.json.bak-*` and re-deploy the old `dist/`.

## Dev

```bash
npm install
npm run dev      # frontend on :5173 (falls back to localStorage)
npm run build    # outputs dist/
```
