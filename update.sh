#!/usr/bin/env bash
# =============================================================
#  TapeRead updater — replaces app files, NEVER touches your
#  journal data (server/data.json is backed up first).
#
#  Safe to run in place (update files copied INTO the install
#  folder) or from a separate folder:
#    ./update.sh                        # in-place
#    ./update.sh /path/to/taperead      # from a separate folder
#
#  Requires a prebuilt dist/ next to update.sh (or npm to build it).
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR"
INSTALL_DIR="${1:-$SCRIPT_DIR}"
SERVICE="taperead"
PORT="${PORT:-8090}"

say()  { echo "==> $*"; }
fail() { echo "!!  $*" >&2; exit 1; }

run_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else fail "need root or sudo for: $*"; fi
}

say "TapeRead updater"

# tolerate `scp server/server.js host:dir/` flattening (server.js next to update.sh)
SERVER_SRC="$SRC/server/server.js"
if [ ! -f "$SERVER_SRC" ] && [ -f "$SRC/server.js" ]; then
  SERVER_SRC="$SRC/server.js"
  say "Using flat server.js copy found next to update.sh"
fi
[ -f "$SERVER_SRC" ] || fail "server.js not found next to update.sh (expected server/server.js or a flat server.js) — copy it over first"

# ---- 1. make sure we have a build to deploy (BEFORE touching anything) ----
if [ ! -f "$SRC/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    say "dist/ missing — building (npm install + npm run build)…"
    (cd "$SRC" && npm install --no-audit --no-fund && npm run build)
  else
    echo "!!  No prebuilt dist/ at $SRC/dist and npm is not installed here, so it can't be built." >&2
    echo "!!  From the machine where the project was built, copy dist/ over, e.g.:" >&2
    echo "       scp -r dist root@$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<server-ip>'):$INSTALL_DIR/" >&2
    echo "    then re-run:  ./update.sh $INSTALL_DIR" >&2
    exit 1
  fi
  [ -f "$SRC/dist/index.html" ] || fail "build did not produce dist/index.html"
fi

[ -f "$INSTALL_DIR/server/server.js" ] || fail "'$INSTALL_DIR' doesn't look like a TapeRead install (server/server.js missing). Usage: ./update.sh /path/to/install"

NEW_VER="$(cat "$SRC/VERSION" 2>/dev/null || echo dev)"
OLD_VER="$(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo 1.0.x)"
if [ "$SRC" = "$INSTALL_DIR" ]; then
  say "Update v$OLD_VER -> v$NEW_VER (in place: $INSTALL_DIR)"
else
  say "Update v$OLD_VER -> v$NEW_VER ($SRC -> $INSTALL_DIR)"
fi

# ---- 2. back up the journal (the only thing that matters) ----
if [ -f "$INSTALL_DIR/server/data.json" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp "$INSTALL_DIR/server/data.json" "$INSTALL_DIR/server/data.json.bak-$STAMP"
  say "Backed up journal -> server/data.json.bak-$STAMP"
fi

# ---- 3. stage first, then swap — so an in-place update can never
#         delete dist/ before the new one is safely copied ----
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC/dist" "$STAGE/dist"
cp "$SERVER_SRC" "$STAGE/server.js"
[ -f "$STAGE/dist/index.html" ] || fail "staged dist is invalid"
grep -q "api/quotes" "$STAGE/server.js" || echo "!!  warning: staged server.js has no /api/quotes route — market tape will show DELAYED" >&2

rm -rf "$INSTALL_DIR/dist"
cp -R "$STAGE/dist" "$INSTALL_DIR/dist"
cp "$STAGE/server.js" "$INSTALL_DIR/server/server.js"
for f in install.sh update.sh README.md VERSION; do
  [ -f "$SRC/$f" ] || continue
  if [ "$SRC/$f" -ef "$INSTALL_DIR/$f" ]; then
    continue # in-place update: already the new file, nothing to copy
  fi
  cp "$SRC/$f" "$INSTALL_DIR/$f"
  case "$f" in install.sh | update.sh) chmod +x "$INSTALL_DIR/$f" ;; esac
done
say "Files replaced (server/data.json untouched)"

# ---- 4. restart the service if one is registered ----
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE.service" 2>/dev/null | grep -q "$SERVICE.service"; then
  run_root systemctl restart "$SERVICE.service"
  sleep 1
  if systemctl is-active --quiet "$SERVICE.service"; then
    say "Service '$SERVICE' restarted and active"
  else
    fail "Service failed to start — check: journalctl -u $SERVICE -n 40"
  fi
else
  say "No systemd service found. Restart manually:"
  echo "      pkill -f 'node server/server.js' ; cd '$INSTALL_DIR' && nohup node server/server.js >/var/log/taperead.log 2>&1 &"
fi

# ---- 5. smoke-test the endpoints ----
if command -v curl >/dev/null 2>&1; then
  sleep 0.5
  if curl -s "http://localhost:${PORT}/api/quotes?symbols=%5EVIX" | grep -q '"quotes"'; then
    say "Market tape OK — /api/quotes is answering"
  else
    echo "!!  /api/quotes did not answer with JSON (tape will show DELAYED)." >&2
    echo "    Check: grep -c api/quotes '$INSTALL_DIR/server/server.js'   (should be >= 2)" >&2
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
say "Done — TapeRead v$NEW_VER is live at:  http://${IP:-<server-ip>}:$PORT"
