#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG="${XRAY_CONFIG:-/etc/xray/config.json}"
RESTART_MARKER="${XRAY_RESTART_MARKER:-/etc/xray/restart.request}"
MARKER_CHECKSUM=""
XRAY_PID=""

stop_xray() {
  if [[ -n "${XRAY_PID}" ]] && kill -0 "${XRAY_PID}" 2>/dev/null; then
    kill "${XRAY_PID}" 2>/dev/null || true
    wait "${XRAY_PID}" 2>/dev/null || true
  fi
}

trap 'stop_xray; exit 0' TERM INT

marker_checksum() {
  if [[ -e "${RESTART_MARKER}" ]]; then
    sha256sum "${RESTART_MARKER}" | awk '{print $1}'
  else
    echo "missing"
  fi
}

start_xray() {
  echo "Starting Xray with ${CONFIG}"
  /usr/local/bin/xray run -config "${CONFIG}" &
  XRAY_PID="$!"
  MARKER_CHECKSUM="$(marker_checksum)"
}

while true; do
  if [[ ! -s "${CONFIG}" ]]; then
    echo "Waiting for ${CONFIG}"
    sleep 2
    continue
  fi

  if [[ -z "${XRAY_PID}" ]]; then
    start_xray
  fi

  NEXT_MARKER_CHECKSUM="$(marker_checksum)"
  if [[ "${NEXT_MARKER_CHECKSUM}" != "${MARKER_CHECKSUM}" ]]; then
    echo "Restart marker changed; restarting Xray"
    stop_xray
    start_xray
  fi

  if [[ -n "${XRAY_PID}" ]] && ! kill -0 "${XRAY_PID}" 2>/dev/null; then
    echo "Xray exited; restarting soon"
    XRAY_PID=""
    sleep 2
    continue
  fi

  sleep 2
done
