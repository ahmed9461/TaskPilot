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
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32) throw new Error("INVALID_ENCRYPTION_KEY");
  }
  seal(value: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [
      "1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }
  open(value: string, context: string) {
    const [version, iv, tag, data] = value.split(".");
    if (version !== "1" || !iv || !tag || data === undefined)
      throw new Error("INVALID_CIPHERTEXT");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
