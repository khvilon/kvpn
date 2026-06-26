import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface KeyRecord {
  id: string;
  email: string;
  comment: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  totalUplink: number;
  totalDownlink: number;
  lastRuntimeUplink: number;
  lastRuntimeDownlink: number;
}

export interface ServerRecord {
  sni: string;
  privateKey: string;
  publicKey: string;
  shortId: string;
  publicHost: string;
}

export interface AppState {
  version: 1;
  server: ServerRecord;
  keys: KeyRecord[];
}

export interface KeyView extends KeyRecord {
  url: string;
}

const XRAY_CONFIG_PATH = "xray/config.json";
const XRAY_RESTART_MARKER_PATH = "xray/restart.request";
const XRAY_INBOUND_TAG = "vless-reality";
const STATE_PATH = "state.json";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeJsonAtomic(filePath: string, value: unknown): boolean {
  ensureDir(path.dirname(filePath));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(filePath) && readFileSync(filePath, "utf8") === content) {
    return false;
  }

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, filePath);
  return true;
}

function parseXrayKeyOutput(raw: string): { privateKey: string; publicKey: string } {
  const privateKey =
    raw.match(/Private(?:\s*key|Key):\s*([A-Za-z0-9_-]{43})/)?.[1] ??
    raw.match(/^PrivateKey:\s*([A-Za-z0-9_-]{43})/m)?.[1];
  const publicKey =
    raw.match(/Public(?:\s*key|Key):\s*([A-Za-z0-9_-]{43})/)?.[1] ??
    raw.match(/^Password:\s*([A-Za-z0-9_-]{43})/m)?.[1];

  if (!privateKey || !publicKey) {
    throw new Error(`Cannot parse xray x25519 output: ${raw}`);
  }

  return { privateKey, publicKey };
}

function generateRealityKeys(): { privateKey: string; publicKey: string } {
  const raw = execFileSync("/usr/local/bin/xray", ["x25519"], { encoding: "utf8" });
  return parseXrayKeyOutput(raw);
}

function deriveRealityPublicKey(privateKey: string): string {
  const raw = execFileSync("/usr/local/bin/xray", ["x25519", "-i", privateKey], { encoding: "utf8" });
  return parseXrayKeyOutput(raw).publicKey;
}

function randomShortId(): string {
  return Buffer.from(randomUUID().replace(/-/g, "").slice(0, 16), "hex").toString("hex");
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseLegacyUrl(filePath: string): { id?: string; publicKey?: string; shortId?: string; sni?: string } {
  if (!existsSync(filePath)) {
    return {};
  }

  const url = readFileSync(filePath, "utf8").trim();
  return {
    id: url.match(/^vless:\/\/([^@]+)@/)?.[1],
    publicKey: url.match(/[?&]pbk=([^&]+)/)?.[1],
    shortId: url.match(/[?&]sid=([^&]+)/)?.[1],
    sni: url.match(/[?&]sni=([^&]+)/)?.[1],
  };
}

function importLegacyState(dataDir: string, publicHost: string, fallbackSni: string): AppState | null {
  const legacyConfigPath = path.join(dataDir, "legacy/config.json");
  const legacyUrlPath = path.join(dataDir, "legacy/xray-reality-client.txt");
  const legacyConfig = readJsonIfExists<any>(legacyConfigPath);
  const legacyUrl = parseLegacyUrl(legacyUrlPath);

  if (!legacyConfig && !legacyUrl.id) {
    return null;
  }

  const inbound = legacyConfig?.inbounds?.find((item: any) => item.protocol === "vless") ?? legacyConfig?.inbounds?.[0];
  const reality = inbound?.streamSettings?.realitySettings;
  const settingsClients = Array.isArray(inbound?.settings?.clients) ? inbound.settings.clients : [];
  const sni = legacyUrl.sni ?? reality?.serverNames?.[0] ?? fallbackSni;
  const privateKey = reality?.privateKey;
  const shortId = legacyUrl.shortId ?? reality?.shortIds?.[0];

  if (!privateKey || !shortId) {
    return null;
  }

  const publicKey = legacyUrl.publicKey ?? deriveRealityPublicKey(privateKey);
  const createdAt = nowIso();
  const keys = settingsClients.map((client: any, index: number) => ({
    id: String(client.id),
    email: String(client.email || `imported-${index + 1}`),
    comment: index === 0 ? "Imported existing key" : `Imported existing key ${index + 1}`,
    enabled: true,
    createdAt,
    updatedAt: createdAt,
    totalUplink: 0,
    totalDownlink: 0,
    lastRuntimeUplink: 0,
    lastRuntimeDownlink: 0,
  })) as KeyRecord[];

  if (keys.length === 0 && legacyUrl.id) {
    keys.push({
      id: legacyUrl.id,
      email: "main",
      comment: "Imported existing key",
      enabled: true,
      createdAt,
      updatedAt: createdAt,
      totalUplink: 0,
      totalDownlink: 0,
      lastRuntimeUplink: 0,
      lastRuntimeDownlink: 0,
    });
  }

  return {
    version: 1,
    server: { sni, privateKey, publicKey, shortId, publicHost },
    keys,
  };
}

function createFreshState(publicHost: string, sni: string): AppState {
  const keys = generateRealityKeys();
  const createdAt = nowIso();
  return {
    version: 1,
    server: {
      sni,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      shortId: randomShortId(),
      publicHost,
    },
    keys: [
      {
        id: randomUUID(),
        email: "main",
        comment: "Default key",
        enabled: true,
        createdAt,
        updatedAt: createdAt,
        totalUplink: 0,
        totalDownlink: 0,
        lastRuntimeUplink: 0,
        lastRuntimeDownlink: 0,
      },
    ],
  };
}

function normalizeHostForUrl(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
}

function renderClientUrl(state: AppState, key: KeyRecord): string {
  const host = normalizeHostForUrl(state.server.publicHost);
  return `vless://${key.id}@${host}:443?type=tcp&security=reality&pbk=${state.server.publicKey}&fp=chrome&sni=${state.server.sni}&sid=${state.server.shortId}&flow=xtls-rprx-vision&encryption=none#${encodeURIComponent(key.comment || key.email)}`;
}

function renderXrayConfig(state: AppState): unknown {
  const clients = state.keys
    .filter((key) => key.enabled)
    .map((key) => ({
      id: key.id,
      flow: "xtls-rprx-vision",
      email: key.email,
    }));

  return {
    log: {
      access: "/var/log/xray/access.log",
      error: "/var/log/xray/error.log",
      loglevel: "warning",
    },
    api: {
      tag: "api",
      services: ["StatsService", "HandlerService"],
    },
    stats: {},
    policy: {
      levels: {
        "0": {
          statsUserUplink: true,
          statsUserDownlink: true,
        },
      },
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
      },
    },
    inbounds: [
      {
        listen: "0.0.0.0",
        port: 443,
        tag: XRAY_INBOUND_TAG,
        protocol: "vless",
        settings: {
          clients,
          decryption: "none",
        },
        streamSettings: {
          network: "tcp",
          security: "reality",
          realitySettings: {
            show: false,
            dest: `${state.server.sni}:443`,
            xver: 0,
            serverNames: [state.server.sni],
            privateKey: state.server.privateKey,
            shortIds: [state.server.shortId],
          },
        },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] },
      },
      {
        listen: "0.0.0.0",
        port: 10085,
        tag: "api",
        protocol: "dokodemo-door",
        settings: { address: "127.0.0.1" },
      },
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }],
    routing: {
      rules: [{ type: "field", inboundTag: ["api"], outboundTag: "api" }],
    },
  };
}

function renderSingleUserConfig(state: AppState, key: KeyRecord): unknown {
  const singleUserConfig = renderXrayConfig({ ...state, keys: [key] }) as { inbounds?: unknown[] };
  return { inbounds: singleUserConfig.inbounds?.slice(0, 1) ?? [] };
}

export function parseStatsOutput(raw: string): Map<string, number> {
  const stats = new Map<string, number>();

  try {
    const parsed = JSON.parse(raw.trim()) as { stat?: Array<{ name?: unknown; value?: unknown }> };
    if (Array.isArray(parsed.stat)) {
      for (const item of parsed.stat) {
        if (typeof item.name !== "string") {
          continue;
        }

        const value = typeof item.value === "number" ? item.value : Number(item.value);
        if (Number.isFinite(value)) {
          stats.set(item.name, value);
        }
      }
      return stats;
    }
  } catch {
    // Older Xray builds print protobuf text, handled below.
  }

  const blockRegex = /name:\s*"([^"]+)"\s+value:\s*(\d+)/g;
  for (const match of raw.matchAll(blockRegex)) {
    stats.set(match[1], Number(match[2]));
  }
  return stats;
}

export class XrayStateStore {
  private readonly statePath: string;
  private readonly xrayConfigPath: string;
  private readonly xrayRestartMarkerPath: string;
  private state: AppState;

  constructor(
    private readonly dataDir: string,
    publicHost: string,
    sni: string,
  ) {
    ensureDir(dataDir);
    ensureDir(path.join(dataDir, "xray"));
    ensureDir(path.join(dataDir, "logs"));

    this.statePath = path.join(dataDir, STATE_PATH);
    this.xrayConfigPath = path.join(dataDir, XRAY_CONFIG_PATH);
    this.xrayRestartMarkerPath = path.join(dataDir, XRAY_RESTART_MARKER_PATH);
    this.state =
      readJsonIfExists<AppState>(this.statePath) ??
      importLegacyState(dataDir, publicHost, sni) ??
      createFreshState(publicHost, sni);

    this.state.server.publicHost = publicHost;
    this.save();
    this.writeXrayConfig();
  }

  listKeys(): KeyView[] {
    return this.state.keys.map((key) => ({ ...key, url: renderClientUrl(this.state, key) }));
  }

  async createKey(comment: string, apiHost: string, apiPort: string): Promise<KeyView> {
    const createdAt = nowIso();
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const key: KeyRecord = {
      id: randomUUID(),
      email: `key-${suffix}`,
      comment: comment.trim() || `Key ${suffix}`,
      enabled: true,
      createdAt,
      updatedAt: createdAt,
      totalUplink: 0,
      totalDownlink: 0,
      lastRuntimeUplink: 0,
      lastRuntimeDownlink: 0,
    };

    this.state.keys.push(key);
    this.saveAndRender();
    await this.addRuntimeKey(key, apiHost, apiPort);
    return { ...key, url: renderClientUrl(this.state, key) };
  }

  updateKey(id: string, comment: string): KeyView {
    const key = this.findKey(id);
    key.comment = comment.trim();
    key.updatedAt = nowIso();
    this.save();
    return { ...key, url: renderClientUrl(this.state, key) };
  }

  async deleteKey(id: string, apiHost: string, apiPort: string): Promise<void> {
    const key = this.findKey(id);
    this.state.keys = this.state.keys.filter((item) => item.id !== id);
    this.saveAndRender();
    await this.removeRuntimeKey(key.email, apiHost, apiPort);
  }

  async refreshTraffic(apiHost: string, apiPort: string): Promise<KeyView[]> {
    let stdout = "";
    try {
      const result = await execFileAsync(
        "/usr/local/bin/xray",
        ["api", "statsquery", `--server=${apiHost}:${apiPort}`, "-pattern", "user>>>"],
        { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch {
      return this.listKeys();
    }

    const stats = parseStatsOutput(stdout);
    for (const key of this.state.keys) {
      const uplink = stats.get(`user>>>${key.email}>>>traffic>>>uplink`) ?? 0;
      const downlink = stats.get(`user>>>${key.email}>>>traffic>>>downlink`) ?? 0;
      key.totalUplink += uplink >= key.lastRuntimeUplink ? uplink - key.lastRuntimeUplink : uplink;
      key.totalDownlink += downlink >= key.lastRuntimeDownlink ? downlink - key.lastRuntimeDownlink : downlink;
      key.lastRuntimeUplink = uplink;
      key.lastRuntimeDownlink = downlink;
    }
    this.save();
    return this.listKeys();
  }

  private findKey(id: string): KeyRecord {
    const key = this.state.keys.find((item) => item.id === id);
    if (!key) {
      throw new Error("Key not found");
    }
    return key;
  }

  private save(): void {
    writeJsonAtomic(this.statePath, this.state);
  }

  private saveAndRender(): void {
    this.save();
    this.writeXrayConfig();
  }

  private writeXrayConfig(): void {
    writeJsonAtomic(this.xrayConfigPath, renderXrayConfig(this.state));
  }

  private requestXrayRestart(): void {
    ensureDir(path.dirname(this.xrayRestartMarkerPath));
    writeFileSync(this.xrayRestartMarkerPath, `${nowIso()} ${randomUUID()}\n`, "utf8");
  }

  private async addRuntimeKey(key: KeyRecord, apiHost: string, apiPort: string): Promise<void> {
    const configPath = path.join(this.dataDir, "tmp", `${key.email}.json`);
    try {
      writeJsonAtomic(configPath, renderSingleUserConfig(this.state, key));
      await execFileAsync(
        "/usr/local/bin/xray",
        ["api", "adu", `--server=${apiHost}:${apiPort}`, configPath],
        { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Runtime Xray add failed for ${key.email}; requesting restart: ${message}`);
      this.requestXrayRestart();
    } finally {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    }
  }

  private async removeRuntimeKey(email: string, apiHost: string, apiPort: string): Promise<void> {
    try {
      await execFileAsync(
        "/usr/local/bin/xray",
        ["api", "rmu", `--server=${apiHost}:${apiPort}`, `-tag=${XRAY_INBOUND_TAG}`, email],
        { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Runtime Xray remove failed for ${email}; requesting restart: ${message}`);
      this.requestXrayRestart();
    }
  }
}
