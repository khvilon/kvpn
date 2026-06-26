import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import https from "node:https";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import { XrayStateStore } from "./xrayState";

const dataDir = process.env.DATA_DIR ?? "/app/data";
const adminUser = process.env.ADMIN_USER ?? "admin";
const adminPublicPort = process.env.ADMIN_PUBLIC_PORT ?? process.env.ADMIN_PORT ?? "8443";
const adminPort = Number(process.env.ADMIN_PORT ?? "8443");
const sni = process.env.SNI ?? "www.cloudflare.com";
const xrayApiHost = process.env.XRAY_API_HOST ?? "xray";
const xrayApiPort = process.env.XRAY_API_PORT ?? "10085";
const certPath = process.env.TLS_CERT ?? path.join(dataDir, "certs/admin.crt");
const keyPath = process.env.TLS_KEY ?? path.join(dataDir, "certs/admin.key");

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function ensureAdminPassword(): string {
  const passwordPath = path.join(dataDir, "admin-password.txt");
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envPassword) {
    ensureDir(path.dirname(passwordPath));
    writeFileSync(passwordPath, `${envPassword}\n`, { encoding: "utf8", mode: 0o600 });
    return envPassword;
  }

  if (existsSync(passwordPath)) {
    const stored = readFileSync(passwordPath, "utf8").trim();
    if (stored) {
      return stored;
    }
  }

  const generated = crypto.randomBytes(16).toString("hex");
  ensureDir(path.dirname(passwordPath));
  writeFileSync(passwordPath, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(passwordPath, 0o600);
  return generated;
}

function detectPublicHost(): string {
  const configured = process.env.PUBLIC_HOST?.trim();
  if (configured) {
    return configured;
  }

  try {
    const detected = execFileSync("curl", ["-4fsS", "https://api.ipify.org"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (detected) {
      return detected;
    }
  } catch {
    // Fall back below.
  }

  return "127.0.0.1";
}

function ensureTlsCertificate(publicHost: string): void {
  if (existsSync(certPath) && existsSync(keyPath)) {
    return;
  }

  ensureDir(path.dirname(certPath));
  const san = /^\d+\.\d+\.\d+\.\d+$/.test(publicHost) ? `IP:${publicHost}` : `DNS:${publicHost}`;
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-days",
      "3650",
      "-subj",
      `/CN=${publicHost}`,
      "-addext",
      `subjectAltName=${san}`,
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ],
    { stdio: "ignore" },
  );
  chmodSync(keyPath, 0o600);
}

const adminPassword = ensureAdminPassword();
const publicHost = detectPublicHost();
ensureTlsCertificate(publicHost);

const store = new XrayStateStore(dataDir, publicHost, sni);
const app = express();

app.use(express.json({ limit: "64kb" }));

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.setHeader("WWW-Authenticate", 'Basic realm="KVPN Admin"');
    res.status(401).send("Authentication required");
    return;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const user = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (!safeEqual(user, adminUser) || !safeEqual(password, adminPassword)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="KVPN Admin"');
    res.status(401).send("Invalid credentials");
    return;
  }

  next();
}

app.use(requireAuth);

app.get("/api/keys", async (_req, res, next) => {
  try {
    res.json({ keys: await store.refreshTraffic(xrayApiHost, xrayApiPort) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/keys", async (req, res, next) => {
  try {
    const comment = typeof req.body?.comment === "string" ? req.body.comment : "";
    res.status(201).json({ key: await store.createKey(comment, xrayApiHost, xrayApiPort) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/keys/:id", (req, res, next) => {
  try {
    const comment = typeof req.body?.comment === "string" ? req.body.comment : "";
    res.json({ key: store.updateKey(req.params.id, comment) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/keys/:id", async (req, res, next) => {
  try {
    await store.deleteKey(req.params.id, xrayApiHost, xrayApiPort);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/logs", (req, res) => {
  const file = req.query.file === "access" ? "access.log" : "error.log";
  const lines = Math.min(Number(req.query.lines ?? 300) || 300, 2000);
  const logPath = path.join(dataDir, "logs", file);

  if (!existsSync(logPath)) {
    res.type("text/plain").send("");
    return;
  }

  const content = readFileSync(logPath, "utf8");
  res.type("text/plain").send(content.split(/\r?\n/).slice(-lines).join("\n"));
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(process.cwd(), "public")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(message === "Key not found" ? 404 : 500).json({ error: message });
});

const server = https.createServer(
  {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  },
  app,
);

server.listen(adminPort, "0.0.0.0", () => {
  console.log(`KVPN admin listening on https://0.0.0.0:${adminPort}`);
  console.log(`Admin URL: https://${publicHost}:${adminPublicPort}`);
  console.log(`Login: ${adminUser}`);
  console.log(`Password: ${adminPassword}`);
});
