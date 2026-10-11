#!/usr/bin/env node
/**
 * TapeRead LAN server — zero dependencies, plain Node.
 *
 *  - Serves the built app from ../dist
 *  - Persists the journal to ./data.json via GET/POST /api/data
 *  - Market tape: GET /api/quotes — Alpha Vantage, refreshed twice daily
 *    (free tier = 25 calls/day, so the server drip-feeds one call every
 *    ~6.5 s during a refresh pass and never exceeds the budget).
 *
 * Env overrides:
 *   PORT                 server port (default 8090)
 *   ALPHAVANTAGE_KEY     API key (default: built-in key below)
 *   AV_SLOTS             comma-separated UTC refresh times (default "14:35,21:15"
 *                        = 10:35 ET after the open settles, 17:15 ET after the close)
 *   AV_DAILY_LIMIT       daily call budget (default 25)
 *
 * Usage:  node server/server.js
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const DIST = path.join(__dirname, "..", "dist");
const DATA_FILE = path.join(__dirname, "data.json");
const QUOTES_FILE = path.join(__dirname, "quotes-cache.json");
const MAX_BODY = 12 * 1024 * 1024; // 12 MB

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

/* ================= market tape — Alpha Vantage ================= */

const AV_KEY = process.env.ALPHAVANTAGE_KEY || "JNNA0FPOOCN2SQXI";
const AV_BASE = "https://www.alphavantage.co/query";
const DAILY_LIMIT = Number(process.env.AV_DAILY_LIMIT || 25);
const RATE_GAP_MS = 6500; // free tier: 5 calls/min → one every 6.5 s
const WEEKEND_SLOTS = ["21:15"]; // crypto-only freshness on Sat/Sun
const DAILY_SLOTS = (process.env.AV_SLOTS || "14:35,21:15").split(",").map((s) => s.trim()).filter(Boolean);

/** The curated tape. Indices use AV's bare symbols (SPX, IXIC, DJI, VIX).
 *  Futures are represented by their ETF proxies per user request:
 *  ES→SPY · NQ→QQQ · crude→USO · gold→GLD. BTC uses the currency endpoint. */
const TAPE = [
  { s: "SPX",  label: "S&P 500", kind: "quote" },
  { s: "IXIC", label: "Nasdaq",  kind: "quote" },
  { s: "DJI",  label: "Dow",     kind: "quote" },
  { s: "VIX",  label: "VIX",     kind: "quote" },
  { s: "SPY",  label: "SPY",     kind: "quote" },
  { s: "QQQ",  label: "QQQ",     kind: "quote" },
  { s: "USO",  label: "Crude",   kind: "quote" },
  { s: "GLD",  label: "Gold",    kind: "quote" },
  { s: "AAPL", label: "AAPL",    kind: "quote" },
  { s: "NVDA", label: "NVDA",    kind: "quote" },
  { s: "TSLA", label: "TSLA",    kind: "quote" },
  { s: "BTC",  label: "BTC",     kind: "fx", from: "BTC", to: "USD" },
];

const quoteCache = new Map(); // s -> { symbol, label, name, price, change, changePct, at }
let callsToday = 0;
let dayKey = "";
const doneSlots = new Set(); // "YYYY-MM-DDTHH:MM"
let lastRefreshAt = 0;
let refreshPassRunning = false;
let lastError = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

function utcDayKey() {
  return new Date().toISOString().slice(0, 10);
}
function rollDay() {
  const k = utcDayKey();
  if (k !== dayKey) {
    dayKey = k;
    callsToday = 0;
    doneSlots.clear();
  }
}
function slotMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function isWeekendUTC() {
  const d = new Date().getUTCDay();
  return d === 0 || d === 6;
}

/** next scheduled refresh as ISO (for the UI chip) */
function nextRefreshAt() {
  const slots = isWeekendUTC() ? WEEKEND_SLOTS : DAILY_SLOTS;
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const s of slots) {
    if (slotMinutes(s) > nowMin) {
      const d = new Date(now);
      d.setUTCHours(Math.floor(slotMinutes(s) / 60), slotMinutes(s) % 60, 0, 0);
      return d.toISOString();
    }
  }
  const d = new Date(now.getTime() + 86400000);
  const s = slots[0] || "14:35";
  d.setUTCHours(Math.floor(slotMinutes(s) / 60), slotMinutes(s) % 60, 0, 0);
  return d.toISOString();
}

function avGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "TapeRead/1.2 (self-hosted journal)" }, timeout: 12000 },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            reject(new Error("non-JSON response"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchSymbol(def) {
  if (def.kind === "fx") {
    const j = await avGet(`${AV_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${def.from}&to_currency=${def.to}&apikey=${AV_KEY}`);
    if (j.Note) throw new Error("rate limit (5/min)");
    if (j.Information) throw new Error("daily limit reached");
    if (j["Error Message"]) throw new Error(String(j["Error Message"]).slice(0, 80));
    const r = j["Realtime Currency Exchange Rate"];
    if (!r || !r["5. Exchange Rate"]) throw new Error("empty fx payload");
    const price = num(r["5. Exchange Rate"]);
    const prev = quoteCache.get(def.s)?.price;
    const change = prev != null ? Math.round((price - prev) * 100) / 100 : 0;
    return {
      symbol: def.s, label: def.label, name: `${def.from}/${def.to}`,
      price, change, changePct: prev ? Math.round((change / prev) * 10000) / 100 : 0, at: Date.now(),
    };
  }
  const j = await avGet(`${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(def.s)}&apikey=${AV_KEY}`);
  if (j.Note) throw new Error("rate limit (5/min)");
  if (j.Information) throw new Error("daily limit reached");
  if (j["Error Message"]) throw new Error(String(j["Error Message"]).slice(0, 80));
  const g = j["Global Quote"];
  if (!g || !g["05. price"]) throw new Error("empty quote payload");
  return {
    symbol: def.s, label: def.label, name: g["01. symbol"] || def.s,
    price: num(g["05. price"]),
    change: num(g["09. change"]),
    changePct: num(String(g["10. change percent"] || "0").replace("%", "")),
    at: Date.now(),
  };
}

function persistQuotes() {
  try {
    fs.writeFileSync(
      QUOTES_FILE,
      JSON.stringify({ savedAt: new Date().toISOString(), quotes: [...quoteCache.values()] })
    );
  } catch {
    /* non-fatal */
  }
}

function loadPersistedQuotes() {
  try {
    const j = JSON.parse(fs.readFileSync(QUOTES_FILE, "utf8"));
    if (Array.isArray(j.quotes)) {
      for (const q of j.quotes) if (q && q.symbol) quoteCache.set(q.symbol, q);
      const latest = j.quotes.reduce((m, q) => Math.max(m, q?.at || 0), 0);
      if (latest) lastRefreshAt = latest;
    }
  } catch {
    /* no cache yet */
  }
}

async function refreshPass(reason) {
  if (refreshPassRunning) return;
  refreshPassRunning = true;
  console.log(`[tape] refresh pass started (${reason}) — ${TAPE.length} symbols, ~${Math.ceil((TAPE.length * RATE_GAP_MS) / 60000)} min`);
  try {
    for (const def of TAPE) {
      rollDay();
      if (callsToday >= DAILY_LIMIT - 1) {
        lastError = `daily budget (${DAILY_LIMIT}) reached — serving cache`;
        console.log(`[tape] ${lastError}`);
        break;
      }
      try {
        const q = await fetchSymbol(def);
        quoteCache.set(def.s, q);
        lastError = "";
      } catch (e) {
        lastError = `${def.s}: ${e.message}`;
        console.error(`[tape] ${lastError}`);
      }
      callsToday++;
      await sleep(RATE_GAP_MS);
    }
    lastRefreshAt = Date.now();
    persistQuotes();
  } finally {
    refreshPassRunning = false;
  }
}

/** scheduler tick: fire a pass when a UTC slot comes due (once per slot per day) */
function tick() {
  rollDay();
  const slots = isWeekendUTC() ? WEEKEND_SLOTS : DAILY_SLOTS;
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const s of slots) {
    const id = `${dayKey}T${s}`;
    if (!doneSlots.has(id) && nowMin >= slotMinutes(s)) {
      doneSlots.add(id);
      refreshPass(`slot ${s}z`).catch(() => {});
    }
  }
}

loadPersistedQuotes();
setTimeout(() => {
  rollDay();
  if (quoteCache.size === 0 && callsToday < DAILY_LIMIT - 1) refreshPass("bootstrap — empty cache").catch(() => {});
}, 1200);
setInterval(tick, 30_000);

/* ================= HTTP server ================= */

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  // ---------- API: market tape ----------
  if (url === "/api/quotes") {
    rollDay();
    const quotes = TAPE.map((def) => quoteCache.get(def.s)).filter(Boolean);
    const payload = {
      ts: Date.now(),
      source: "alphavantage",
      refreshedAt: lastRefreshAt || null,
      nextRefreshAt: nextRefreshAt(),
      callsToday,
      dailyLimit: DAILY_LIMIT,
      slots: isWeekendUTC() ? WEEKEND_SLOTS : DAILY_SLOTS,
      quotes,
    };
    const dbg = new URL(req.url, "http://localhost").searchParams.get("debug");
    if (dbg) {
      payload.lastError = lastError;
      payload.refreshing = refreshPassRunning;
      payload.doneSlots = [...doneSlots];
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
    return;
  }

  // ---------- API: journal data ----------
  if (url === "/api/data") {
    if (req.method === "GET") {
      fs.readFile(DATA_FILE, "utf8", (err, body) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "no data yet" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(body);
      });
      return;
    }
    if (req.method === "POST") {
      let chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "payload too large" }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          JSON.parse(body); // validate before writing
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const tmp = DATA_FILE + ".tmp";
        fs.writeFile(tmp, body, (err) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "write failed" }));
            return;
          }
          fs.rename(tmp, DATA_FILE, () => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
          });
        });
      });
      return;
    }
    res.writeHead(405).end();
    return;
  }

  // ---------- static files ----------
  let rel = decodeURIComponent(url === "/" ? "/index.html" : url);
  const filePath = path.normalize(path.join(DIST, rel));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || st.isDirectory()) {
      // SPA fallback
      const fallback = path.join(DIST, "index.html");
      fs.readFile(fallback, (e2, html) => {
        if (e2) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("dist/ not found — run: npm install && npm run build");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const lan =
    Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address || "localhost";
  console.log(`TapeRead listening on  http://localhost:${PORT}   (LAN: http://${lan}:${PORT})`);
  console.log(`Journal file: ${DATA_FILE}`);
  console.log(`Market tape: Alpha Vantage · refreshes at ${(isWeekendUTC() ? WEEKEND_SLOTS : DAILY_SLOTS).join(" & ")} UTC · budget ${DAILY_LIMIT} calls/day`);
});
