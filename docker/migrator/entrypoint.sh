#!/usr/bin/env bash
set -Eeuo pipefail

DATA_DIR="${DATA_DIR:-/app/data}"
ADMIN_PORT="${ADMIN_PORT:-8443}"
HOST_XRAY_CONFIG="/host/usr/local/etc/xray/config.json"

mkdir -p "${DATA_DIR}/legacy" "${DATA_DIR}/xray" "${DATA_DIR}/logs"

if [[ ! -f "${DATA_DIR}/state.json" && -f "${HOST_XRAY_CONFIG}" ]]; then
  cp "${HOST_XRAY_CONFIG}" "${DATA_DIR}/legacy/config.json"
fi

host_systemctl() {
  if nsenter -t 1 -m -u -i -n -p -- systemctl "$@"; then
    return 0
  fi
  return 1
}

if host_systemctl list-unit-files | grep -q '^xray\.service'; then
  host_systemctl disable --now xray >/dev/null 2>&1 || true
fi

host_systemctl stop nginx >/dev/null 2>&1 || true
host_systemctl stop apache2 >/dev/null 2>&1 || true
host_systemctl stop caddy >/dev/null 2>&1 || true

if command -v nsenter >/dev/null 2>&1; then
  nsenter -t 1 -m -u -i -n -p -- ufw allow 22/tcp >/dev/null 2>&1 || true
  nsenter -t 1 -m -u -i -n -p -- ufw allow 443/tcp >/dev/null 2>&1 || true
  nsenter -t 1 -m -u -i -n -p -- ufw allow 8443/tcp >/dev/null 2>&1 || true
  nsenter -t 1 -m -u -i -n -p -- ufw allow "${ADMIN_PORT}/tcp" >/dev/null 2>&1 || true
  nsenter -t 1 -m -u -i -n -p -- ufw --force enable >/dev/null 2>&1 || true
fi

echo "Migration complete"
