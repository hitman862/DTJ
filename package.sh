#!/usr/bin/env bash
# =============================================================
#  TapeRead packager — builds a single portable tarball you can
#  install on ANY Linux box (no npm / no internet required for
#  the app itself, only Node.js):
#
#      ./package.sh            # uses existing dist/, or builds if missing
#      ./package.sh --build    # force a fresh frontend build
#
#  Output: taperead-<version>.tar.gz next to this script.
# =============================================================
set -euo pipefail
cd "$(dirname "$0")"

VERSION="$(cat VERSION 2>/dev/null || echo dev)"
NAME="taperead-${VERSION}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

say()  { echo "==> $*"; }
fail() { echo "!!  $*" >&2; exit 1; }

# ---- 1. make sure the frontend is built ----
if [ "${1:-}" = "--build" ] || [ ! -f dist/index.html ]; then
  command -v npm >/dev/null 2>&1 || fail "npm is required to build dist/ (install it or provide a prebuilt dist/)"
  say "Building frontend (npm install + vite build)…"
  npm install --no-audit --no-fund
  npm run build
fi
[ -f dist/index.html ] || fail "dist/index.html missing after build"
[ -f server/server.js ] || fail "server/server.js missing"

# ---- 2. assemble a clean package (app only — no data, no sources) ----
PKG="$STAGE/$NAME"
mkdir -p "$PKG/server"
cp -R dist "$PKG/dist"
cp server/server.js "$PKG/server/server.js"
cp install.sh update.sh README.md VERSION "$PKG/" 2>/dev/null || true
[ -f "$PKG/install.sh" ] || fail "install.sh missing"
chmod +x "$PKG/install.sh" "$PKG/update.sh" 2>/dev/null || true

# ---- 3. compress ----
OUT="$(pwd)/${NAME}.tar.gz"
tar -C "$STAGE" -czf "$OUT" "$NAME"
SIZE="$(du -h "$OUT" | cut -f1)"

say "Package ready:  $OUT ($SIZE)"
echo ""
echo "  Install on any Linux box:"
echo "    scp $OUT user@server:~/"
echo "    tar xzf ${NAME}.tar.gz && cd ${NAME}"
echo "    ./install.sh --service"
echo ""
echo "  Migrate an existing journal (optional, before first start):"
echo "    scp oldbox:/path/taperead/server/data.json ${NAME}/server/"
echo ""
