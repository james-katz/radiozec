#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# RadioZec — Startup Script
# Starts all required services in the correct order.
# Usage:
#   ./start.sh              Start everything (dev mode)
#   ./start.sh prod         Start in production mode (daemonized)
#   ./start.sh stop         Stop all RadioZec services
#   ./start.sh restart      Restart all services (prod mode)
#   ./start.sh status       Show status of all services
#   ./start.sh logs         Tail all service logs
#   ./start.sh install      Install optional dependencies (MediaMTX)
# ══════════════════════════════════════════════════════════

set -euo pipefail

# ── Resolve project root ────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_DIR="$PROJECT_ROOT/server"
LOG_DIR="$SERVER_DIR/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# PID file directory
PID_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PID_DIR" "$LOG_DIR"

# ── Source fnm (Fast Node Manager) if available ─────────
# Ensures we use the correct Node.js version (v22+)
FNM_PATH="${FNM_PATH:-$HOME/.local/share/fnm}"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
  eval "$(fnm env --shell bash)" 2>/dev/null
fi

# ── Helpers ─────────────────────────────────────────────

log_info()  { echo -e "${CYAN}[RadioZec]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[RadioZec]${NC} ✓ $1"; }
log_warn()  { echo -e "${YELLOW}[RadioZec]${NC} ⚠ $1"; }
log_error() { echo -e "${RED}[RadioZec]${NC} ✗ $1"; }

check_binary() {
  if ! command -v "$1" &>/dev/null; then
    log_error "$1 is not installed. $2"
    return 1
  fi
  return 0
}

is_port_in_use() {
  ss -tlnp 2>/dev/null | grep -q ":$1 " 2>/dev/null
}

wait_for_port() {
  local port=$1 name=$2 timeout=${3:-10}
  local elapsed=0
  while ! is_port_in_use "$port"; do
    sleep 0.5
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$((timeout * 2))" ]; then
      log_error "$name failed to start on port $port within ${timeout}s"
      return 1
    fi
  done
  log_ok "$name is running on port $port"
}

save_pid() {
  echo "$2" > "$PID_DIR/$1.pid"
}

get_pid() {
  local pidfile="$PID_DIR/$1.pid"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

stop_service() {
  local name=$1
  local pid
  if pid=$(get_pid "$name"); then
    kill "$pid" 2>/dev/null && log_ok "Stopped $name (PID $pid)"
    rm -f "$PID_DIR/$name.pid"
  else
    log_warn "$name not running (no PID found)"
  fi
}

# ── Install Command ─────────────────────────────────────

do_install() {
  echo ""
  echo -e "${BOLD}${CYAN}📻 RadioZec — Install Dependencies${NC}"
  echo ""

  # ── System dependencies ──
  log_info "Checking system dependencies..."
  local to_install=()

  command -v icecast2   &>/dev/null || to_install+=("icecast2")
  command -v liquidsoap &>/dev/null || to_install+=("liquidsoap")
  command -v ffmpeg     &>/dev/null || to_install+=("ffmpeg")
  command -v yt-dlp     &>/dev/null || to_install+=("yt-dlp")

  if [ ${#to_install[@]} -gt 0 ]; then
    log_warn "Missing system packages: ${to_install[*]}"
    echo -e "   Install with: ${BOLD}sudo apt install ${to_install[*]}${NC}"
    echo ""
  else
    log_ok "All system dependencies installed."
  fi

  # ── MediaMTX ──
  if [ -f "$SERVER_DIR/mediamtx" ]; then
    local current_version
    current_version=$("$SERVER_DIR/mediamtx" --help 2>&1 | head -1 || echo "installed")
    log_ok "MediaMTX already installed at server/mediamtx"
  else
    log_info "Installing MediaMTX (live streaming server)..."

    local arch
    arch=$(uname -m)
    local mtx_arch="amd64"
    case "$arch" in
      x86_64)  mtx_arch="amd64" ;;
      aarch64) mtx_arch="arm64v8" ;;
      armv7l)  mtx_arch="armv7" ;;
      *)       log_error "Unsupported architecture: $arch"; return 1 ;;
    esac

    # Get latest version
    log_info "Fetching latest MediaMTX version..."
    local latest_version
    latest_version=$(curl -sL "https://api.github.com/repos/bluenviron/mediamtx/releases/latest" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || echo "v1.20.1")

    local download_url="https://github.com/bluenviron/mediamtx/releases/download/${latest_version}/mediamtx_${latest_version}_linux_${mtx_arch}.tar.gz"

    log_info "Downloading MediaMTX ${latest_version} for ${mtx_arch}..."
    if curl -sL "$download_url" -o "/tmp/mediamtx.tar.gz"; then
      tar -xzf /tmp/mediamtx.tar.gz -C "$SERVER_DIR" mediamtx
      chmod +x "$SERVER_DIR/mediamtx"
      rm -f /tmp/mediamtx.tar.gz
      log_ok "MediaMTX ${latest_version} installed to server/mediamtx"
    else
      log_error "Failed to download MediaMTX from: $download_url"
      return 1
    fi
  fi

  # ── npm dependencies ──
  log_info "Checking npm dependencies..."
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    log_info "Installing root npm packages..."
    (cd "$PROJECT_ROOT" && npm install)
  fi
  if [ ! -d "$PROJECT_ROOT/client/node_modules" ]; then
    log_info "Installing client npm packages..."
    (cd "$PROJECT_ROOT/client" && npm install)
  fi
  if [ ! -d "$PROJECT_ROOT/server/node_modules" ]; then
    log_info "Installing server npm packages..."
    (cd "$PROJECT_ROOT/server" && npm install)
  fi
  log_ok "All npm dependencies installed."

  # ── Port conflict check ──
  echo ""
  log_info "Checking for port conflicts..."

  local conflicts=0
  local ports=("8001:Icecast" "1234:Liquidsoap" "3000:Node.js" "5173:Vite" "1935:MediaMTX RTMP" "8888:MediaMTX HLS" "9997:MediaMTX API")
  for entry in "${ports[@]}"; do
    local port="${entry%%:*}"
    local name="${entry##*:}"
    if is_port_in_use "$port"; then
      local proc_info
      proc_info=$(ss -tlnp | grep ":$port " | grep -oP 'users:\(\("\K[^"]+' || echo "unknown")
      log_warn "Port $port ($name) is already in use by: $proc_info"
      conflicts=1
    fi
  done

  # Check for system Icecast on port 8000 (conflicts with Zkool)
  if is_port_in_use 8000; then
    local proc_info
    proc_info=$(ss -tlnp | grep ":8000 " | grep -oP 'users:\(\("\K[^"]+' || echo "unknown")
    log_warn "Port 8000 is in use by: $proc_info"
    log_warn "This will conflict with Zkool (Zcash daemon). Run:"
    echo -e "         ${BOLD}sudo systemctl stop icecast2 && sudo systemctl disable icecast2${NC}"
  fi

  if [ "$conflicts" -eq 0 ]; then
    log_ok "No port conflicts found."
  fi

  echo ""
  log_ok "${BOLD}Installation complete!${NC}"
  echo -e "   Run ${BOLD}./start.sh${NC} to start RadioZec."
  echo ""
}

# ── Stop Command ────────────────────────────────────────

do_stop() {
  echo ""
  log_info "${BOLD}Stopping RadioZec services...${NC}"
  echo ""

  stop_service "node"
  stop_service "liquidsoap"
  stop_service "icecast"
  stop_service "mediamtx"

  # Also kill by process name as fallback
  killall -q icecast2 2>/dev/null || true
  killall -q liquidsoap 2>/dev/null || true
  # Only kill mediamtx started from our server dir
  pkill -f "$SERVER_DIR/mediamtx" 2>/dev/null || true

  echo ""
  log_ok "All services stopped."
}

# ── Status Command ──────────────────────────────────────

do_status() {
  echo ""
  echo -e "${BOLD}RadioZec Service Status${NC}"
  echo "─────────────────────────────"

  local services=("icecast:8001" "liquidsoap:1234" "node:3000" "mediamtx:9997")
  for entry in "${services[@]}"; do
    local name="${entry%%:*}"
    local port="${entry##*:}"
    local pid_status=""

    if pid=$(get_pid "$name" 2>/dev/null); then
      pid_status=" (PID $pid)"
    fi

    if is_port_in_use "$port"; then
      echo -e "  ${GREEN}●${NC} $name${pid_status} — port $port"
    else
      echo -e "  ${RED}○${NC} $name — not running"
    fi
  done

  # Also check port 8000 conflict
  if is_port_in_use 8000; then
    echo ""
    echo -e "  ${YELLOW}⚠${NC} Port 8000 occupied (may conflict with Zkool)"
  fi

  echo ""
}

# ── Logs Command ────────────────────────────────────────

do_logs() {
  local follow="${1:-}"
  echo ""
  echo -e "${BOLD}RadioZec Logs${NC}"
  echo "─────────────────────────────"
  echo -e "  Log dir: ${DIM}$LOG_DIR/${NC}"
  echo ""

  local logfiles=()
  for f in "$LOG_DIR"/*.log; do
    [ -f "$f" ] && logfiles+=("$f")
  done

  if [ ${#logfiles[@]} -eq 0 ]; then
    log_warn "No log files found in $LOG_DIR/"
    return
  fi

  echo -e "  ${DIM}Following: ${logfiles[*]##*/}${NC}"
  echo -e "  ${DIM}Press Ctrl+C to stop${NC}"
  echo ""

  tail -f "${logfiles[@]}"
}

# ── Start Command ───────────────────────────────────────

do_start() {
  local mode="${1:-dev}"

  echo ""
  echo -e "${BOLD}${CYAN}📻 RadioZec${NC}"
  echo -e "   Starting in ${BOLD}${mode}${NC} mode..."
  echo ""

  # ── 1. Check required binaries ──────────────────────
  log_info "Checking dependencies..."
  local missing=0

  check_binary "node"       "Install Node.js ≥ 18" || missing=1
  check_binary "icecast2"   "sudo apt install icecast2" || missing=1
  check_binary "liquidsoap" "sudo apt install liquidsoap" || missing=1
  check_binary "yt-dlp"     "pip install yt-dlp" || missing=1
  check_binary "ffmpeg"     "sudo apt install ffmpeg" || missing=1

  if [ "$missing" -eq 1 ]; then
    echo ""
    log_error "Missing dependencies. Run ${BOLD}./start.sh install${NC} first."
    exit 1
  fi
  log_ok "All dependencies found."
  echo ""

  # ── 2. Check for system Icecast on port 8000 ────────
  if is_port_in_use 8000; then
    local proc_8000
    proc_8000=$(ss -tlnp | grep ':8000 ' | grep -oP 'users:\(\("\K[^"]+' || echo "unknown")
    if [[ "$proc_8000" == *icecast* ]]; then
      log_warn "System Icecast running on port 8000 (conflicts with Zkool)"
      log_warn "Run: sudo systemctl stop icecast2 && sudo systemctl disable icecast2"
    fi
  fi

  # ── 3. Ensure fallback music exists ─────────────────
  local fallback_dir="$SERVER_DIR/media/fallback"
  mkdir -p "$fallback_dir"
  local fallback_count
  fallback_count=$(find "$fallback_dir" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.ogg' -o -name '*.opus' \) 2>/dev/null | wc -l)
  if [ "$fallback_count" -eq 0 ]; then
    log_warn "No fallback music in $fallback_dir"
    log_warn "Liquidsoap needs at least one audio file. Add MP3s to server/media/fallback/"
    exit 1
  fi
  log_ok "Found $fallback_count fallback track(s)."

  # ── 4. Ensure jingles dir exists ────────────────────
  mkdir -p "$SERVER_DIR/media/jingles"

  # ── 5. Start Icecast ────────────────────────────────
  if is_port_in_use 8001; then
    log_ok "Icecast already running on port 8001."
  else
    log_info "Starting Icecast..."
    # Icecast -b daemonizes itself. Run from server/ so relative
    # log paths (./logs/) in icecast.xml resolve correctly.
    (cd "$SERVER_DIR" && icecast2 -c icecast.xml -b 2>/dev/null)
    sleep 1
    # Icecast daemonizes — find its PID by matching the config path
    local ice_pid
    ice_pid=$(pgrep -f 'icecast2.*icecast.xml' | head -1 || echo "")
    if [ -n "$ice_pid" ]; then
      save_pid "icecast" "$ice_pid"
    fi
    wait_for_port 8001 "Icecast" 5
  fi

  # ── 6. Start Liquidsoap ─────────────────────────────
  if is_port_in_use 1234; then
    log_ok "Liquidsoap already running on port 1234."
  else
    log_info "Starting Liquidsoap..."
    # Auto-detect version: 1.x uses radio-legacy.liq, 2.x uses radio.liq
    local ls_version
    ls_version=$(liquidsoap --version 2>/dev/null | head -1 | grep -oP '\d+' | head -1 || echo "2")
    local liq_script="radio.liq"
    if [ "$ls_version" = "1" ]; then
      liq_script="radio-legacy.liq"
      log_info "Detected Liquidsoap 1.x — using ${liq_script}"
    fi
    # Liquidsoap's .liq uses relative paths — must run from server/
    (cd "$SERVER_DIR" && liquidsoap ./"$liq_script" &>"$LOG_DIR/liquidsoap.log" &)
    sleep 1
    local ls_pid
    ls_pid=$(pgrep -f "liquidsoap.*radio" | head -1 || true)
    if [ -n "$ls_pid" ]; then
      save_pid "liquidsoap" "$ls_pid"
    fi
    wait_for_port 1234 "Liquidsoap" 10
  fi

  # ── 7. Start MediaMTX (optional) ────────────────────
  if [ -f "$SERVER_DIR/mediamtx" ] || command -v mediamtx &>/dev/null; then
    if is_port_in_use 9997; then
      log_ok "MediaMTX already running on port 9997."
    else
      log_info "Starting MediaMTX..."
      local mtx_bin="mediamtx"
      [ -f "$SERVER_DIR/mediamtx" ] && mtx_bin="$SERVER_DIR/mediamtx"
      "$mtx_bin" "$SERVER_DIR/mediamtx.yml" &>"$LOG_DIR/mediamtx.log" &
      save_pid "mediamtx" $!
      wait_for_port 9997 "MediaMTX" 5 || log_warn "MediaMTX not available — live streaming disabled."
    fi
  else
    log_warn "MediaMTX not found — run ${BOLD}./start.sh install${NC} to set it up."
  fi

  echo ""

  # ── 8. Start Node.js app ────────────────────────────
  if [ "$mode" = "prod" ]; then
    log_info "Compiling server TypeScript..."
    (cd "$SERVER_DIR" && npx tsc)
    echo ""
    log_info "Starting Node.js (production)..."
    cd "$SERVER_DIR"
    nohup node dist/index.js &>"$LOG_DIR/node.log" &
    save_pid "node" $!
    cd "$PROJECT_ROOT"
    wait_for_port 3000 "Node.js" 10
    echo ""
    echo "─────────────────────────────────────"
    log_ok "${BOLD}RadioZec is running!${NC}"
    echo -e "   App:     https://radio.zcashbr.com"
    echo -e "   Admin:   https://radio.zcashbr.com/admin"
    echo -e "   API:     http://localhost:3000"
    echo -e "   Icecast: http://localhost:8001"
    echo -e "   Logs:    $LOG_DIR/"
    echo ""
    echo -e "   ${DIM}./start.sh status${NC}   Check service health"
    echo -e "   ${DIM}./start.sh logs${NC}     Follow live output"
    echo -e "   ${DIM}./start.sh stop${NC}     Stop all services"
    echo -e "   ${DIM}./start.sh restart${NC}  Restart everything"
    echo "─────────────────────────────────────"
  else
    echo "─────────────────────────────────────"
    log_ok "${BOLD}Infrastructure ready!${NC}"
    echo -e "   Icecast:    port 8001 ✓"
    echo -e "   Liquidsoap: port 1234 ✓"
    if is_port_in_use 9997; then
      echo -e "   MediaMTX:   port 9997 ✓"
    fi
    echo ""
    echo -e "   Starting dev server..."
    echo "─────────────────────────────────────"
    echo ""
    # Run npm dev in foreground (so Ctrl+C stops it but not infra)
    cd "$PROJECT_ROOT"
    exec npm run dev
  fi
}

# ── Main ────────────────────────────────────────────────

case "${1:-}" in
  stop)
    do_stop
    ;;
  status)
    do_status
    ;;
  logs|log)
    do_logs
    ;;
  restart)
    do_stop
    sleep 1
    do_start prod
    ;;
  install)
    do_install
    ;;
  prod|production)
    do_start prod
    ;;
  *)
    do_start dev
    ;;
esac
