#!/usr/bin/env bash
# TapeRead — install on a LAN-only Linux server
# Usage: ./install.sh [--service] [--build]
set -e

cd "$(dirname "$0")"
APP_DIR="$(pwd)"
PORT="${PORT:-8090}"
SERVICE_NAME="taperead"

# Privilege helper: plain commands when root, sudo otherwise.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
  if ! command -v sudo >/dev/null 2>&1; then
    echo "ERROR: not running as root and 'sudo' is not installed."
    echo "       Re-run as root (su -), or install sudo: apt-get install -y sudo"
    exit 1
  fi
fi

echo "==> TapeRead installer"

# 1. Ensure Node.js is available (works on Debian/Ubuntu, RHEL/Fedora, Arch, SUSE)
if ! command -v node >/dev/null 2>&1; then
  echo "==> Node.js not found — installing via the system package manager"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y && $SUDO apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm nodejs
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y nodejs
  else
    echo "ERROR: Node.js 18+ is required. Install it (https://nodejs.org) and re-run."
    exit 1
  fi
fi
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js install failed."; exit 1; }
NODE_BIN="$(command -v node)"
echo "==> Node $(node -v)"

# 2. Build the frontend (skip if dist/ already exists, --build forces it)
if [ ! -f dist/index.html ] || [ "$1" = "--build" ] || [ "$2" = "--build" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: dist/ is missing and npm is not installed, so it can't be built."
    echo "       Use the prebuilt package (with dist/ included), or install npm first."
    exit 1
  fi
  echo "==> Building frontend (npm install + vite build)"
  npm install --no-audit --no-fund
  npm run build
else
  echo "==> dist/ already built — skipping (use --build to force)"
fi

# 3. Optionally install + start a systemd service
for arg in "$@"; do
  if [ "$arg" = "--service" ]; then
    UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    echo "==> Writing ${UNIT_FILE}"
    $SUDO tee "$UNIT_FILE" > /dev/null <<EOF
[Unit]
Description=TapeRead trading journal (LAN)
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} server/server.js
Environment=PORT=${PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable --now ${SERVICE_NAME}.service
    echo "==> systemd service '${SERVICE_NAME}' enabled and started"
    echo "    manage with: systemctl status|restart|stop ${SERVICE_NAME}"
  fi
done

echo ""
echo "=============================================="
echo "  TapeRead ready"
echo "----------------------------------------------"
if [ -n "$(command -v hostname)" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] && echo "  Open on any LAN device:  http://${IP}:${PORT}"
fi
echo "  Or locally:              http://localhost:${PORT}"
echo "  Data file:               ${APP_DIR}/server/data.json"
echo "  Start manually:          node server/server.js"
echo "=============================================="
