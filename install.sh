#!/usr/bin/env bash
set -Eeuo pipefail

SNI="${1:-www.cloudflare.com}"
XRAY_VERSION="${XRAY_VERSION:-26.2.6}"

export SNI
export XRAY_VERSION

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker and run this again."
  exit 1
fi

docker compose up -d --build

echo
echo "KVPN containers are starting."
echo "Credentials are printed by the admin container:"
echo "  docker compose logs admin"
