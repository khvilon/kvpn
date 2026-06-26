# KVPN

KVPN runs an Xray VLESS REALITY server and a small HTTPS admin UI.

The admin UI lets you:

- copy existing key URLs
- create keys
- delete keys
- edit key comments
- see uploaded/downloaded traffic per key
- inspect Xray access and error logs

The backend is TypeScript. Runtime state is stored in local files under `./data`; no database service is required.

## Install

Docker and Docker Compose must already be installed on the host. After that, the project is started by Compose:

```bash
git clone https://github.com/khvilon/kvpn.git
cd kvpn
docker compose up -d --build
```

Do not run npm install on the host. Node, TypeScript, and npm dependencies are used only inside the admin Docker image during `docker compose up -d --build`.

Optional shortcut:

```bash
./install.sh
```

`install.sh` only runs `docker compose up -d --build`. Application setup lives in containers.

The admin container prints credentials:

```bash
docker compose logs admin
```

Open:

```text
https://<server-ip>:8443
```

The certificate is self-signed, so the browser will show a warning on first open.

## Existing key import

The `migrator` container reads the old host config from `/usr/local/etc/xray/config.json`, copies it into `data/legacy/config.json`, stops the old host `xray.service`, and opens `22/tcp`, `443/tcp`, and `8443/tcp` through UFW when UFW exists.

On first start, the admin service imports the existing key, REALITY private key, SNI, and shortId. The old client URL remains valid after the Docker migration as long as the server IP is the same and the old REALITY target SNI is still usable. If that target starts failing REALITY handshakes, keep the key UUID/public key/shortId and issue updated URLs with a working SNI.

## Runtime layout

```text
docker-compose.yml
data/
  state.json                 # keys, comments, traffic totals
  admin-password.txt         # generated admin password
  certs/admin.crt            # self-signed HTTPS certificate
  certs/admin.key
  legacy/config.json         # copied old host config, if present
  xray/config.json           # generated Xray config
  logs/access.log
  logs/error.log
```

## Ports

- `443/tcp`: Xray VLESS REALITY
- `8443/tcp`: HTTPS admin UI
- `22/tcp`: SSH, preserved by migrator when UFW exists

The default SNI is `www.cloudflare.com`, which has been verified to complete REALITY handshakes with the pinned Xray build. To use another SNI:

```bash
SNI=www.apple.com docker compose up -d --build
```

## Operations

Update:

```bash
git pull --ff-only
docker compose up -d --build
```

View containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```
