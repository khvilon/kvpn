# KVPN Xray REALITY installer

This repository reproduces the VPN setup inspected on the existing server:

- Ubuntu 24.04 / systemd
- Xray `26.2.6`
- VLESS over TCP on `443`
- REALITY with `xtls-rprx-vision`
- default SNI: `www.microsoft.com`
- UFW inbound rules: `22/tcp` and `443/tcp`
- generated client URL is saved to `/root/xray-reality-client.txt`

## Install

Run this on a clean Ubuntu server as a user with `sudo`:

```bash
git clone https://github.com/khvilon/kvpn.git
cd kvpn
sudo bash install.sh
```

At the end, the script prints a `vless://...` URL. Copy it into a client that supports VLESS REALITY.

## One command

Install in one command:

```bash
curl -fsSL https://raw.githubusercontent.com/khvilon/kvpn/master/install.sh | sudo bash
```

## Custom SNI

The inspected server uses `www.microsoft.com`. To use another SNI:

```bash
curl -fsSL https://raw.githubusercontent.com/khvilon/kvpn/master/install.sh | sudo bash -s -- www.cloudflare.com
```

## What the script does

1. Installs dependencies: `curl`, `jq`, `uuid-runtime`, `openssl`, `ufw`, `ca-certificates`, `unzip`.
2. Installs or updates Xray through the official XTLS installer pinned to `26.2.6`.
3. Stops `nginx`, `apache2`, or `caddy` if one of them occupies `443/tcp`.
4. Generates a fresh client UUID, REALITY x25519 keys, and `shortId`.
5. Writes `/usr/local/etc/xray/config.json`.
6. Enables UFW and allows `22/tcp`, `443/tcp`.
7. Restarts `xray` and prints the final client URL.

Re-running the script regenerates keys and the client URL.
