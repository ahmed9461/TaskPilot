import type pg from "pg";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  SignalDataSet,
} from "baileys";
import { Vault, hash } from "../security.js";
import { transaction } from "../db.js";

export interface AuthCodec {
  fresh(): AuthenticationCreds;
  encode(value: unknown): string;
  decode(value: string): any;
  appKey(value: unknown): SignalDataTypeMap["app-state-sync-key"];
}
// Auth and key identifiers never become filenames or raw database identifiers.
export class PgAuthStore {
  constructor(
    private pool: pg.Pool,
    private vault: Vault,
    private sessionId: string,
    private codec: AuthCodec,
    private epoch?: string,
  ) {}
  private key(category: string, id: string) {
    return hash(`${this.sessionId}:${category}:${id}`);
  }
  private context(category: string, key: string) {
    return `wa-auth:${this.sessionId}:${category}:${key}`;
  }
  private async read(category: string, ids: string[]) {
    if (ids.length > 2000) throw new Error("AUTH_BATCH_TOO_LARGE");
    const keys = ids.map((id) => this.key(category, id));
    const rows = (
      await this.pool.query(
        "SELECT id_hash,encrypted_payload FROM whatsapp_auth WHERE session_id=$1 AND category=$2 AND id_hash=ANY($3::text[])",
        [this.sessionId, category, keys],
      )
    ).rows;
    const values = new Map(rows.map((r) => [r.id_hash, r.encrypted_payload]));
    const result: Record<string, any> = {};
    for (let i = 0; i < ids.length; i++) {
      const sealed = values.get(keys[i]);
      if (sealed)
        result[ids[i]!] = this.codec.decode(
          this.vault.open(sealed, this.context(category, keys[i]!)),
        );
    }
    return result;
  }
  private async write(
    entries: { category: string; id: string; value: unknown }[],
  ) {
    if (entries.length > 2000) throw new Error("AUTH_BATCH_TOO_LARGE");
    await transaction(this.pool, async (c) => {
      const row = (
        await c.query(
          "SELECT auth_epoch,forgotten_at FROM whatsapp_sessions WHERE id=$1 FOR SHARE",
          [this.sessionId],
        )
      ).rows[0];
      if (row?.forgotten_at) throw new Error("SESSION_FORGOTTEN");
      if (this.epoch && row?.auth_epoch !== this.epoch)
        throw new Error("AUTH_LEASE_CHANGED");
      for (const e of entries) {
        const key = this.key(e.category, e.id);
        if (e.value === null) {
          await c.query(
            "DELETE FROM whatsapp_auth WHERE session_id=$1 AND category=$2 AND id_hash=$3",
            [this.sessionId, e.category, key],
          );
          continue;
        }
        const sealed = this.vault.seal(
          this.codec.encode(e.value),
          this.context(e.category, key),
        );
        await c.query(
          "INSERT INTO whatsapp_auth(session_id,category,id_hash,encrypted_payload,key_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,category,id_hash) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,key_version=EXCLUDED.key_version,updated_at=now()",
          [this.sessionId, e.category, key, sealed, this.vault.keyVersion],
        );
      }
    });
  }
  async paired() {
    const value = (await this.read("creds", ["main"])).main;
    // Baileys QR pairing saves me.id; `registered` is set by phone-code pairing only.
    // Match the SDK's login/registration decision, not that unrelated flag.
    return typeof value?.me?.id === "string" && value.me.id.length > 0;
  }
  async load(): Promise<{
    state: AuthenticationState;
    saveCreds: (update: Partial<AuthenticationCreds>) => Promise<void>;
  }> {
    const saved = (await this.read("creds", ["main"])).main;
    const creds: AuthenticationCreds = saved ?? this.codec.fresh();
    if (!saved)
      await this.write([{ category: "creds", id: "main", value: creds }]);
    let pending: Promise<void> = Promise.resolve();
    const saveCreds = (update: Partial<AuthenticationCreds>) => {
      Object.assign(creds, update);
      // Capture each state before queuing, so an older delayed write cannot win.
      const snapshot = this.codec.decode(this.codec.encode(creds));
      pending = pending.then(() =>
        this.write([{ category: "creds", id: "main", value: snapshot }]),
      );
      return pending;
    };
    return {
      state: {
        creds,
        keys: {
          get: async <T extends keyof SignalDataTypeMap>(
            type: T,
            ids: string[],
          ) => {
            const values = await this.read(type, ids);
            if (type === "app-state-sync-key")
              for (const id of Object.keys(values))
                values[id] = this.codec.appKey(values[id]);
            return values as { [id: string]: SignalDataTypeMap[T] };
          },
          set: async (data: SignalDataSet) => {
            const entries: { category: string; id: string; value: unknown }[] =
              [];
            for (const [category, values] of Object.entries(data))
              for (const [id, value] of Object.entries(values ?? {}))
                entries.push({ category, id, value });
            await this.write(entries);
          },
          clear: async () => {
            await transaction(this.pool, async (c) => {
              if (this.epoch) {
                const row = (
                  await c.query(
                    "SELECT auth_epoch FROM whatsapp_sessions WHERE id=$1 FOR SHARE",
                    [this.sessionId],
                  )
                ).rows[0];
                if (row?.auth_epoch !== this.epoch)
                  throw new Error("AUTH_LEASE_CHANGED");
              }
              await c.query(
                "DELETE FROM whatsapp_auth WHERE session_id=$1 AND category<>'creds'",
                [this.sessionId],
              );
            });
          },
        },
      },
      saveCreds,
    };
  }
}
