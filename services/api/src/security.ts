import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export class Vault {
  private keys = new Map<number, Buffer>();
  readonly keyVersion: number;
  private versioned: boolean;
  constructor(key: string) {
    if (key.length > 4096) throw new Error("INVALID_ENCRYPTION_KEY");
    this.versioned = key.trim().startsWith("{");
    const cfg = this.versioned
      ? JSON.parse(key)
      : {
          format: "taskpilot-keyring-v1",
          active: 1,
          keys: { "1": key.trim() },
        };
    if (
      cfg.format !== "taskpilot-keyring-v1" ||
      !Number.isSafeInteger(cfg.active) ||
      cfg.active < 1 ||
      cfg.active > 2147483647 ||
      !cfg.keys ||
      Array.isArray(cfg.keys) ||
      Object.keys(cfg.keys).length > 16 ||
      Object.keys(cfg).sort().join(",") !== "active,format,keys"
    )
      throw new Error("INVALID_ENCRYPTION_KEY");
    for (const [id, value] of Object.entries(cfg.keys)) {
      if (
        !/^[1-9][0-9]{0,9}$/.test(id) ||
        Number(id) > 2147483647 ||
        typeof value !== "string" ||
        !/^[A-Za-z0-9+/]{43}=$/.test(value)
      )
        throw new Error("INVALID_ENCRYPTION_KEY");
      const bytes = Buffer.from(value, "base64");
      if (bytes.length !== 32 || bytes.toString("base64") !== value)
        throw new Error("INVALID_ENCRYPTION_KEY");
      this.keys.set(Number(id), bytes);
    }
    if (!this.keys.has(cfg.active)) throw new Error("INVALID_ENCRYPTION_KEY");
    this.keyVersion = cfg.active;
  }
  seal(value: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.keys.get(this.keyVersion)!,
      iv,
    );
    cipher.setAAD(
      Buffer.from(
        this.versioned ? `TaskPilot:2:${this.keyVersion}:${context}` : context,
      ),
    );
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [
      ...(this.versioned ? ["2", String(this.keyVersion)] : ["1"]),
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }
  open(value: string, context: string) {
    const parts = value.split(".");
    const version = parts.shift();
    const rawId = version === "2" ? parts.shift() : "1";
    const keyId = Number(rawId);
    const [iv, tag, data] = parts;
    if (
      !["1", "2"].includes(version ?? "") ||
      parts.length !== 3 ||
      !Number.isSafeInteger(keyId) ||
      String(keyId) !== rawId ||
      !this.keys.has(keyId) ||
      !iv ||
      !tag ||
      data === undefined ||
      Buffer.from(iv, "base64").length !== 12 ||
      Buffer.from(tag, "base64").length !== 16
    )
      throw new Error("INVALID_CIPHERTEXT");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.keys.get(keyId)!,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(
      Buffer.from(
        version === "2" ? `TaskPilot:2:${keyId}:${context}` : context,
      ),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
