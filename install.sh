#!/usr/bin/env bash
set -Eeuo pipefail

SNI="${1:-www.microsoft.com}"
XRAY_VERSION="${XRAY_VERSION:-26.2.6}"

CFG="/usr/local/etc/xray/config.json"
OUT="/root/xray-reality-client.txt"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root: sudo bash install.sh"
    exit 1
  fi
}

need_ubuntu_like() {
  if [[ ! -f /etc/os-release ]]; then
    echo "Cannot detect OS: /etc/os-release is missing"
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"debian"* ]]; then
    echo "This installer expects Ubuntu/Debian with systemd and apt."
    echo "Detected: ${PRETTY_NAME:-unknown}"
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd is required."
    exit 1
  fi
}

install_base() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl jq uuid-runtime openssl ufw ca-certificates unzip
}

current_xray_version() {
  if [[ -x /usr/local/bin/xray ]]; then
    /usr/local/bin/xray version 2>/dev/null | awk 'NR == 1 { print $2 }'
  fi
}

install_xray_if_needed() {
  local current
  current="$(current_xray_version || true)"

  if [[ "${current}" == "${XRAY_VERSION#v}" ]]; then
    return 0
  fi

  bash <(curl -Ls https://raw.githubusercontent.com/XTLS/Xray-install/main/install-release.sh) install --version "$XRAY_VERSION"
}

free_port_443_if_common_webserver() {
  local busy
  busy="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:443$/ {print}')"
  [[ -z "${busy}" ]] && return 0

  if echo "${busy}" | grep -qi "xray"; then
    return 0
  fi

  systemctl stop nginx 2>/dev/null || true
  systemctl stop apache2 2>/dev/null || true
  systemctl stop caddy 2>/dev/null || true

  sleep 1
  busy="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:443$/ {print}')"
  if [[ -n "${busy}" ]] && ! echo "${busy}" | grep -qi "xray"; then
    echo "Port 443 is still busy:"
    echo "${busy}"
    echo "Free port 443 and run this installer again."
    exit 1
  fi
}

gen_keys() {
  local raw priv pbk
  raw="$(/usr/local/bin/xray x25519 2>&1 || true)"

  priv="$(printf '%s\n' "${raw}" | sed -nE 's/.*Private([[:space:]]*key|Key):[[:space:]]*([A-Za-z0-9_-]{43}).*/\2/p' | head -n1)"
  pbk="$(printf '%s\n' "${raw}" | sed -nE 's/.*Public([[:space:]]*key|Key):[[:space:]]*([A-Za-z0-9_-]{43}).*/\2/p' | head -n1)"

  if [[ -z "${pbk}" ]]; then
    pbk="$(printf '%s\n' "${raw}" | sed -nE 's/^Password:[[:space:]]*([A-Za-z0-9_-]{43})$/\1/p' | head -n1)"
  fi

  if [[ ! "${priv}" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
    echo "Bad private key from xray x25519:"
    echo "${raw}"
    exit 1
  fi

  if [[ ! "${pbk}" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
    echo "Bad public key from xray x25519:"
    echo "${raw}"
    exit 1
  fi

  printf '%s|%s\n' "${priv}" "${pbk}"
}

write_config() {
  local uuid="$1"
  local priv="$2"
  local sid="$3"

  mkdir -p /usr/local/etc/xray

  cat >"${CFG}" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          { "id": "${uuid}", "flow": "xtls-rprx-vision", "email": "main" }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${SNI}:443",
          "xver": 0,
          "serverNames": ["${SNI}"],
          "privateKey": "${priv}",
          "shortIds": ["${sid}"]
        }
      },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
    }
  ],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
EOF

  chmod 0644 "${CFG}"
  jq empty "${CFG}"
}

enable_firewall() {
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
}

restart_and_check() {
  systemctl daemon-reload
  systemctl enable xray >/dev/null 2>&1 || true
  systemctl restart xray
  sleep 1

  if ! systemctl is-active --quiet xray; then
    echo "xray failed to start"
    systemctl --no-pager -l status xray || true
    exit 1
  fi

  if ! ss -ltnp | grep -q ':443'; then
    echo "xray does not listen on 443"
    ss -ltnp || true
    exit 1
  fi
}

detect_public_ip() {
  local ip
  ip="$(curl -4fsS https://api.ipify.org || true)"
  if [[ -z "${ip}" ]]; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
  fi

  if [[ -z "${ip}" ]]; then
    echo "Cannot detect public IPv4 address"
    exit 1
  fi

  printf '%s\n' "${ip}"
}

write_url() {
  local uuid="$1"
  local pbk="$2"
  local sid="$3"
  local ip url

  ip="$(detect_public_ip)"
  url="vless://${uuid}@${ip}:443?type=tcp&security=reality&pbk=${pbk}&fp=chrome&sni=${SNI}&sid=${sid}&flow=xtls-rprx-vision&encryption=none#Reality-Auto"

  printf '%s\n' "${url}" >"${OUT}"
  chmod 0600 "${OUT}"

  echo
  echo "=============================="
  echo "DONE. Copy this URL:"
  cat "${OUT}"
  echo "=============================="
  echo "Saved to: ${OUT}"
}

main() {
  local priv pbk uuid sid

  need_root
  need_ubuntu_like
  install_base
  install_xray_if_needed
  free_port_443_if_common_webserver

  IFS='|' read -r priv pbk <<<"$(gen_keys)"
  uuid="$(uuidgen)"
  sid="$(openssl rand -hex 8)"

  write_config "${uuid}" "${priv}" "${sid}"
  enable_firewall
  restart_and_check
  write_url "${uuid}" "${pbk}" "${sid}"
}

main "$@"
