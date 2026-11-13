import type pg from "pg";
import { toDataURL } from "qrcode";
import { randomUUID } from "node:crypto";
import { PgAuthStore } from "./auth-store.js";
import {
  baileysFactory,
  inspectTextEvent,
  packetFlags,
  type LiveSocket,
  type SocketFactory,
  type SocketUpdate,
  type QuoteKey,
} from "./socket.js";
import { Vault, hash } from "../security.js";
import { transaction, event } from "../db.js";
import { Fault, Service } from "../service.js";
import { recordReceipt, receiptSummary } from "./receipts.js";
import {
  DefinitelyNotSent,
  type WhatsAppTransport,
  type ReplyTarget,
} from "../transport.js";

export interface ConnectorPolicy {
  connectionEnabled: boolean;
  sendingEnabled: boolean;
}
interface Active {
  id: string;
  lease: pg.PoolClient;
  socket?: LiveSocket;
  opening?: Promise<void>;
  stopping?: Promise<void>;
  generation: number;
  attempts: number;
  since: number;
  closed: boolean;
  qr?: { value: string; expires: number };
  cancelRetry?: () => void;
  tasks: Set<Promise<unknown>>;
  queue: Promise<void>;
  control: Promise<void>;
  credentials: Promise<void>;
  queued: number;
  groups: Map<string, string>;
  monitored: Map<string, { id: string; since: number }>;
  receiveCounts: Record<string, number>;
  lastObservedAt: string | null;
  observing: number;
}
export class WhatsAppConnector implements WhatsAppTransport {
  readonly provider = "baileys" as const;
  private active = new Map<string, Active>();
  private factory?: SocketFactory;
  constructor(
    private pool: pg.Pool,
    private vault: Vault,
    readonly policy: ConnectorPolicy,
    private loadFactory: () => Promise<SocketFactory> = baileysFactory,
    private schedule: (fn: () => void, delay: number) => () => void = (
      fn,
      delay,
    ) => {
      const t = setTimeout(fn, delay);
      return () => clearTimeout(t);
    },
    private now: () => number = () => Date.now(),
  ) {
    if (policy.sendingEnabled && !policy.connectionEnabled)
      throw new Error("SENDING_REQUIRES_CONNECTION_APPROVAL");
  }
  get connectionEnabled() {
    return this.policy.connectionEnabled;
  }
  get sendingEnabled() {
    return this.policy.sendingEnabled;
  }
  capabilities() {
    return {
      implemented: true,
      provider: "baileys",
      version: "7.0.0-rc14",
      unofficial: true,
      connectionEnabled: this.connectionEnabled,
      sendingEnabled: this.sendingEnabled,
      pairingMethod: "qr",
      maxActiveSessions: 1,
    };
  }
  private async status(
    id: string,
    status: string,
    error: string | null = null,
  ) {
    await transaction(this.pool, async (c) => {
      const changed = await c.query(
        "UPDATE whatsapp_sessions SET status=$2,last_error_code=$3,version=version+1,connected_at=CASE WHEN $2='CONNECTED' THEN now() ELSE connected_at END WHERE id=$1 AND (status IS DISTINCT FROM $2 OR last_error_code IS DISTINCT FROM $3) RETURNING id",
        [id, status, error],
      );
      if (changed.rowCount) await event(c, "WHATSAPP_STATUS_CHANGED", id);
    });
  }
  private track(
    a: Active,
    fn: () => Promise<unknown>,
    generation = a.generation,
  ) {
    const task = Promise.resolve().then(fn);
    a.tasks.add(task);
    void task
      .catch(() => {
        if (!a.closed && a.generation === generation)
          return this.fail(a, "CONNECTOR_OPERATION_FAILED");
      })
      .catch(() => {})
      .finally(() => a.tasks.delete(task));
  }
  async settled(id: string) {
    const a = this.active.get(id);
    while (a?.tasks.size) await Promise.allSettled([...a.tasks]);
  }
  private async fail(a: Active, code: string) {
    if (a.closed) return;
    await this.stop(a, false).catch(() => {});
    await this.pool
      .query(
        "UPDATE whatsapp_sessions SET connect_requested=false WHERE id=$1",
        [a.id],
      )
      .catch(() => {});
    await this.status(a.id, "ERROR", code).catch(() => {});
  }
  async connect(id: string) {
    if (!this.connectionEnabled)
      throw new Fault("LIVE_WHATSAPP_NOT_AUTHORIZED", 403);
    if (this.active.has(id)) return;
    const lease = await this.pool.connect();
    let a: Active | undefined;
    try {
      if (
        !(
          await lease.query(
            "SELECT pg_try_advisory_lock(hashtextextended($1,0)) locked",
            ["taskpilot-wa:" + id],
          )
        ).rows[0].locked
      )
        throw new Fault("WHATSAPP_SESSION_IN_USE");
      const row = await transaction(this.pool, async (c) => {
        const row = (
          await c.query(
            "UPDATE whatsapp_sessions SET connect_requested=true,receiving_since=COALESCE(receiving_since,now()),status='CONNECTING',last_error_code=NULL,version=version+1 WHERE id=$1 AND provider='baileys' RETURNING receiving_since",
            [id],
          )
        ).rows[0];
        if (!row) throw new Fault("LIVE_SESSION_REQUIRED", 400);
        await event(c, "WHATSAPP_CONNECT_REQUESTED", id);
        return row;
      });
      a = {
        id,
        lease,
        generation: 0,
        attempts: 0,
        since: Math.floor(new Date(row.receiving_since).getTime() / 1000),
        closed: false,
        tasks: new Set(),
        queue: Promise.resolve(),
        control: Promise.resolve(),
        credentials: Promise.resolve(),
        queued: 0,
        groups: new Map(),
        monitored: new Map(),
        receiveCounts: {},
        lastObservedAt: null,
        observing: 0,
      };
      this.active.set(id, a);
      await this.refreshBindings(id);
      lease.on("error", () => {
        if (a && !a.closed) void this.fail(a, "WHATSAPP_LEASE_LOST");
      });
      await this.open(a);
    } catch (error) {
      if (a) await this.fail(a, "CONNECTOR_START_FAILED");
      else {
        await lease
          .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
            "taskpilot-wa:" + id,
          ])
          .catch(() => {});
        lease.release();
      }
      throw error instanceof Fault
        ? error
        : new Fault("WHATSAPP_CONNECT_FAILED", 503);
    }
  }
  private async open(a: Active) {
    const opening = this.openSocket(a);
    a.opening = opening;
    await opening;
  }
  private async openSocket(a: Active) {
    if (a.closed) return;
    this.factory ??= await this.loadFactory();
    if (a.closed) return;
    const epoch = randomUUID();
    await this.pool.query(
      "UPDATE whatsapp_sessions SET auth_epoch=$2 WHERE id=$1",
      [a.id, epoch],
    );
    const auth = await new PgAuthStore(
      this.pool,
      this.vault,
      a.id,
      this.factory.codec,
      epoch,
    ).load();
    if (a.closed) return;
    const generation = ++a.generation;
    const socket = this.factory.create(auth.state);
    a.socket = socket;
    socket.onCreds((update) => {
      if (!a.closed && a.generation === generation) {
        a.credentials = auth.saveCreds(update);
        this.track(a, () => a.credentials, generation);
      }
    });
    socket.onUpdate((update) => {
      if (!a.closed && a.generation === generation) {
        const operation = a.control.then(async () => {
          if (!a.closed && a.generation === generation)
            await this.update(a, update);
        });
        a.control = operation;
        this.track(a, () => operation, generation);
      }
    });
    socket.onMessages((messages, type) => {
      if (a.closed || a.generation !== generation) return;
      for (const raw of messages) {
        const remote = (raw as { key?: { remoteJid?: unknown } } | null)?.key
          ?.remoteJid;
        if (typeof remote !== "string" || !/^\d[\d-]*@g\.us$/.test(remote))
          continue;
        const binding = a.monitored.get(remote);
        if (!binding) continue;
        const result = inspectTextEvent(raw, Math.max(a.since, binding.since));
        const reason =
          type === "notify" || type === "append"
            ? result.reason
            : type === "append"
              ? "HISTORY_EVENT"
              : "OTHER_EVENT";
        const observe = (code = reason) => {
          a.receiveCounts[code] = Math.min(
            1000000,
            (a.receiveCounts[code] ?? 0) + 1,
          );
          a.lastObservedAt = new Date(this.now()).toISOString();
        };
        const item =
          type === "notify" || type === "append" ? result.item : null;
        // Rejected/history traffic must never consume the durable queue or
        // disconnect a session. Diagnostic sampling is bounded and best effort.
        if (!item) {
          if (a.observing >= 10) continue;
          a.observing++;
          this.track(a, async () => {
            try {
              const group = await this.pool.query(
                "SELECT g.id FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE g.session_id=$1 AND g.external_group_id=$2 AND g.enabled=true AND s.connect_requested=true",
                [a.id, remote],
              );
              if (!a.closed && a.generation === generation && group.rowCount) {
                observe();
                await transaction(this.pool, (c) =>
                  recordReceipt(
                    c,
                    a.id,
                    group.rows[0].id,
                    (raw as { key?: { id?: unknown } }).key?.id,
                    reason,
                    packetFlags(raw),
                    type,
                  ),
                );
              }
            } catch {
              // Diagnostics never turn a rejected event into a connector failure.
            } finally {
              a.observing--;
            }
          });
          continue;
        }
        if (a.queued >= 100) {
          void this.fail(a, "WHATSAPP_BACKPRESSURE");
          break;
        }
        a.queued++;
        const task = a.queue
          .then(async () => {
            if (a.closed || a.generation !== generation) return;
            const group = (
              await this.pool.query(
                "SELECT g.id,g.receive_after FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE g.session_id=$1 AND g.external_group_id=$2 AND g.enabled=true AND s.provider='baileys' AND s.connect_requested=true",
                [a.id, remote],
              )
            ).rows[0];
            if (!group) return;
            if (
              item.timestamp <
              Math.floor(new Date(group.receive_after).getTime() / 1000)
            ) {
              observe("STALE_TIMESTAMP");
              await transaction(this.pool, (c) =>
                recordReceipt(
                  c,
                  a.id,
                  group.id,
                  item.key.id,
                  "STALE_TIMESTAMP",
                  packetFlags(raw),
                  type,
                ),
              ).catch(() => {});
              return;
            }
            observe();
            const context = `wa-ingress:${a.id}:${group.id}:${hash(item.key.id)}`;
            const sealed = this.vault.seal(JSON.stringify(item), context);
            await transaction(this.pool, async (c) => {
              await c.query("SELECT pg_advisory_xact_lock(8240005)");
              await recordReceipt(
                c,
                a.id,
                group.id,
                item.key.id,
                reason,
                packetFlags(raw),
                type,
              );
              await c.query(
                "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,encrypted_payload) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,group_id,external_message_id) DO NOTHING",
                [a.id, group.id, item.key.id, sealed],
              );
            });
          })
          .finally(() => {
            a.queued--;
          });
        a.queue = task;
        this.track(a, () => task);
      }
    });
  }
  private async update(a: Active, u: SocketUpdate) {
    if (u.qr) {
      a.qr = { value: u.qr, expires: this.now() + 45000 };
      await this.status(a.id, "QR_AVAILABLE");
    }
    if (u.connection === "open") {
      a.qr = undefined;
      a.attempts = 0;
      await this.status(a.id, "CONNECTED");
    }
    if (u.connection !== "close") return;
    a.qr = undefined;
    await a.credentials;
    a.socket = undefined;
    a.generation++;
    if ([401, 403, 440, 500].includes(u.code ?? 0)) {
      await this.stop(a, false);
      await this.pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=false WHERE id=$1",
        [a.id],
      );
      await this.status(a.id, "REAUTH_REQUIRED", "WHATSAPP_AUTH_REQUIRED");
      return;
    }
    a.attempts++;
    if (a.attempts > 5) {
      await this.fail(a, "WHATSAPP_RETRY_LIMIT");
      return;
    }
    await this.status(a.id, "RECONNECTING", "WHATSAPP_DISCONNECTED");
    a.cancelRetry = this.schedule(
      () => {
        a.cancelRetry = undefined;
        this.track(a, () => this.open(a));
      },
      u.code === 515 ? 500 : Math.min(60000, 2000 * 2 ** (a.attempts - 1)),
    );
  }
  private async stop(a: Active, manual: boolean) {
    a.stopping ??= this.stopSocket(a, manual);
    await a.stopping;
  }
  private async stopSocket(a: Active, manual: boolean) {
    a.closed = true;
    a.generation++;
    a.qr = undefined;
    a.cancelRetry?.();
    await a.opening?.catch(() => {});
    await a.socket?.end().catch(() => {});
    await a.credentials.catch(() => {});
    await this.pool.query(
      "UPDATE whatsapp_sessions SET auth_epoch=$2 WHERE id=$1",
      [a.id, randomUUID()],
    );
    await a.lease
      .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
        "taskpilot-wa:" + a.id,
      ])
      .catch(() => {});
    a.lease.release();
    this.active.delete(a.id);
    if (manual)
      await this.pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=false WHERE id=$1",
        [a.id],
      );
  }
  async disconnect(id: string) {
    const a = this.active.get(id);
    if (a) await this.stop(a, true);
    else
      await this.pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=false WHERE id=$1",
        [id],
      );
    await this.status(id, "STOPPED");
  }
  async close() {
    for (const a of [...this.active.values()]) await this.stop(a, false);
  }
  async restore() {
    if (!this.connectionEnabled) return;
    const rows = (
      await this.pool.query(
        "SELECT id FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested=true",
      )
    ).rows;
    if (!rows.length) return;
    this.factory ??= await this.loadFactory();
    for (const row of rows) {
      if (
        await new PgAuthStore(
          this.pool,
          this.vault,
          row.id,
          this.factory.codec,
        ).paired()
      )
        await this.connect(row.id);
      else {
        await this.pool.query(
          "UPDATE whatsapp_sessions SET connect_requested=false WHERE id=$1",
          [row.id],
        );
        await this.status(row.id, "REAUTH_REQUIRED");
      }
    }
  }
  async pairing(id: string) {
    if (!this.connectionEnabled)
      throw new Fault("LIVE_WHATSAPP_NOT_AUTHORIZED", 403);
    const qr = this.active.get(id)?.qr;
    if (!qr || qr.expires <= this.now()) throw new Fault("PAIRING_QR_EXPIRED");
    return {
      image: await toDataURL(qr.value, {
        errorCorrectionLevel: "M",
        width: 320,
        margin: 2,
      }),
      expiresInSeconds: Math.max(
        1,
        Math.floor((qr.expires - this.now()) / 1000),
      ),
    };
  }
  async listGroups(id: string) {
    const a = this.active.get(id);
    if (!a?.socket || (await this.getSessionHealth(id)) !== "CONNECTED")
      throw new Fault("WHATSAPP_NOT_CONNECTED");
    const groups = (await a.socket.groups())
      .filter((g) => /^\d[\d-]*@g\.us$/.test(g.id) && g.title.length <= 200)
      .slice(0, 500);
    a.groups = new Map(groups.map((g) => [g.id, g.title]));
    return groups.map((g) => ({ externalGroupId: g.id, title: g.title }));
  }
  knownGroup(id: string, external: string) {
    return this.active.get(id)?.groups.has(external) === true;
  }
  async refreshBindings(id: string) {
    const a = this.active.get(id);
    if (!a) return;
    const rows = (
      await this.pool.query(
        "SELECT id,external_group_id,receive_after FROM groups WHERE session_id=$1 AND enabled=true",
        [id],
      )
    ).rows;
    a.monitored = new Map(
      rows.map((g) => [
        g.external_group_id,
        {
          id: g.id,
          since: Math.floor(new Date(g.receive_after).getTime() / 1000),
        },
      ]),
    );
  }
  async receiveDiagnostics(id: string) {
    const row = (
      await this.pool.query(
        "SELECT id FROM whatsapp_sessions WHERE id=$1 AND provider='baileys'",
        [id],
      )
    ).rows[0];
    if (!row) throw new Fault("NOT_FOUND", 404);
    const a = this.active.get(id);
    return {
      scope: "enabled-groups-only",
      resetOnProcessRestart: true,
      bestEffort: true,
      active: !!a && !a.closed,
      counts: { ...a?.receiveCounts },
      lastObservedAt: a?.lastObservedAt ?? null,
      durable: await receiptSummary(this.pool, id),
      durableRetentionDays: 7,
      durableMaxRecords: 10000,
    };
  }
  canSend(id: string) {
    return (
      this.sendingEnabled &&
      !!this.active.get(id)?.socket &&
      !this.active.get(id)?.closed
    );
  }
  async getSessionHealth(id: string) {
    return (
      (
        await this.pool.query(
          "SELECT status FROM whatsapp_sessions WHERE id=$1",
          [id],
        )
      ).rows[0]?.status ?? "NOT_FOUND"
    );
  }
  async replyToMessage(target: ReplyTarget) {
    if (
      !this.canSend(target.sessionId) ||
      (await this.getSessionHealth(target.sessionId)) !== "CONNECTED"
    )
      throw new DefinitelyNotSent("WHATSAPP_NOT_READY");
    const row = (
      await this.pool.query(
        "SELECT s.encrypted_transport_key,g.external_group_id FROM source_messages s JOIN groups g ON g.id=s.group_id WHERE s.id=$1 AND s.session_id=$2 AND s.group_id=$3 AND s.external_message_id=$4",
        [
          target.sourceMessageId,
          target.sessionId,
          target.groupId,
          target.externalMessageId,
        ],
      )
    ).rows[0];
    if (!row?.encrypted_transport_key)
      throw new DefinitelyNotSent("QUOTE_KEY_UNAVAILABLE");
    const key = JSON.parse(
      this.vault.open(
        row.encrypted_transport_key,
        `wa-source:${target.sourceMessageId}`,
      ),
    ) as QuoteKey;
    if (
      key.id !== target.externalMessageId ||
      key.remoteJid !== row.external_group_id ||
      key.fromMe
    )
      throw new DefinitelyNotSent("QUOTE_TARGET_MISMATCH");
    const socket = this.active.get(target.sessionId)!.socket!;
    const id = await socket.send(
      row.external_group_id,
      target.body,
      key,
      hash("taskpilot:" + target.jobId)
        .slice(0, 32)
        .toUpperCase(),
    );
    return { providerMessageId: id };
  }
  async drainOnce() {
    let claimed: string | undefined;
    try {
      return await transaction(this.pool, async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(8240005)");
        const row = (
          await c.query(
            "SELECT q.*,g.enabled FROM whatsapp_ingress q JOIN groups g ON g.id=q.group_id WHERE q.state='PENDING' ORDER BY q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1",
          )
        ).rows[0];
        if (!row) return false;
        claimed = row.id;
        if (!row.enabled) {
          await c.query(
            "UPDATE whatsapp_ingress SET state='DROPPED',encrypted_payload=NULL WHERE id=$1",
            [row.id],
          );
          return true;
        }
        const context = `wa-ingress:${row.session_id}:${row.group_id}:${hash(row.external_message_id)}`;
        const item = JSON.parse(
          this.vault.open(row.encrypted_payload, context),
        );
        try {
          await new Service(this.pool, this.vault).ingest(
            {
              sessionId: row.session_id,
              groupId: row.group_id,
              externalMessageId: row.external_message_id,
              text: item.text,
            },
            item.key,
          );
        } catch (error) {
          if (!(error instanceof Fault && error.code === "GROUP_NOT_ENABLED"))
            throw error;
        }
        await c.query(
          "UPDATE whatsapp_ingress SET state='DONE',encrypted_payload=NULL WHERE id=$1",
          [row.id],
        );
        return true;
      });
    } catch (error) {
      if (claimed)
        await this.pool.query(
          "UPDATE whatsapp_ingress SET attempts=attempts+1,last_error_code='INGRESS_PROCESSING_FAILED',state=CASE WHEN attempts>=2 THEN 'ERROR' ELSE 'PENDING' END WHERE id=$1 AND state='PENDING'",
          [claimed],
        );
      throw error;
    }
  }
  startIngressWorker() {
    let running = false,
      stopped = false;
    const timer = setInterval(async () => {
      if (running || stopped) return;
      running = true;
      try {
        for (let i = 0; i < 10; i++) if (!(await this.drainOnce())) break;
      } catch {
        /* Encrypted rows stay pending; no raw logs. */
      } finally {
        running = false;
      }
    }, 1000);
    return async () => {
      stopped = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
    };
  }
}
