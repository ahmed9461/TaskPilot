import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { PoolClient } from "pg";
import { transaction, event } from "./db.js";
import { Vault, token, hash } from "./security.js";
import { routeTask } from "./rules.js";
import { normalize, parseMessage } from "./parser.js";
import type { MessageInput } from "../../../packages/contracts/src/index.js";
export class Fault extends Error {
  constructor(
    public code: string,
    public statusCode = 409,
  ) {
    super(code);
  }
}
export class Service {
  constructor(
    public pool: pg.Pool,
    public vault: Vault,
  ) {}
  async account(
    c: PoolClient,
    input: {
      namespace: string;
      username: string;
      displayName: string;
      password?: string;
    },
    updateCredential = false,
  ) {
    const row = (
      await c.query(
        `INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,$2,$3,$4)
      ON CONFLICT(namespace,username_normalized) DO UPDATE SET username_normalized=EXCLUDED.username_normalized RETURNING *`,
        [
          randomUUID(),
          normalize(input.namespace),
          normalize(input.username),
          input.displayName,
        ],
      )
    ).rows[0];
    if (input.password) {
      const ciphertext = this.vault.seal(
        input.password,
        `credential:${row.id}`,
      );
      const previous = (
        await c.query(
          "SELECT ciphertext FROM account_credentials WHERE account_id=$1",
          [row.id],
        )
      ).rows[0];
      if (
        previous &&
        !updateCredential &&
        this.vault.open(previous.ciphertext, `credential:${row.id}`) !==
          input.password
      )
        throw new Fault("CREDENTIAL_CONFLICT");
      await c.query(
        `INSERT INTO account_credentials(account_id,ciphertext,key_version) VALUES($1,$2,1)
        ON CONFLICT(account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,updated_at=now()`,
        [row.id, ciphertext],
      );
    }
    return row;
  }
  async ingest(input: MessageInput, transportKey?: unknown) {
    return transaction(this.pool, async (c) => {
      const group = (
        await c.query(
          "SELECT * FROM groups WHERE id=$1 AND session_id=$2 AND enabled=true",
          [input.groupId, input.sessionId],
        )
      ).rows[0];
      if (!group) throw new Fault("GROUP_NOT_ENABLED", 403);
      const messageId = randomUUID();
      const inserted = await c.query(
        `INSERT INTO source_messages(id,session_id,group_id,external_message_id,encrypted_payload,state)
        VALUES($1,$2,$3,$4,$5,'REVIEW') ON CONFLICT(session_id,group_id,external_message_id) DO NOTHING RETURNING id`,
        [
          messageId,
          input.sessionId,
          input.groupId,
          input.externalMessageId,
          this.vault.seal(input.text, `message:${messageId}`),
        ],
      );
      if (!inserted.rowCount) return { duplicate: true };
      if (transportKey)
        await c.query(
          "UPDATE source_messages SET encrypted_transport_key=$2 WHERE id=$1",
          [
            messageId,
            this.vault.seal(
              JSON.stringify(transportKey),
              `wa-source:${messageId}`,
            ),
          ],
        );
      const parsed = parseMessage(input.text);
      const rules = (
        await c.query(
          "SELECT * FROM group_rules WHERE group_id=$1 AND enabled=true ORDER BY priority DESC,id",
          [group.id],
        )
      ).rows;
      const route = routeTask(input.text, rules, group.task_type_id);
      await c.query(
        "UPDATE source_messages SET routing_task_type_id=$2,routing_priority=$3,routing_ambiguous=$4 WHERE id=$1",
        [
          messageId,
          route.ambiguous ? null : route.taskTypeId,
          route.priority,
          route.ambiguous,
        ],
      );
      if (!parsed.username && !parsed.displayName && !parsed.password) {
        await c.query(
          "UPDATE source_messages SET state='IGNORED',encrypted_payload=NULL,encrypted_transport_key=NULL WHERE id=$1",
          [messageId],
        );
        return { id: messageId, state: "IGNORED" };
      }
      group.task_type_id = route.taskTypeId;
      group.priority = route.priority;
      if (
        route.ambiguous ||
        parsed.needsReview ||
        parsed.username!.length > 200 ||
        parsed.displayName!.length > 200 ||
        (parsed.password?.length ?? 0) > 1024
      ) {
        await event(c, "MESSAGE_MISSING_FIELDS", messageId);
        return { id: messageId, state: "REVIEW" };
      }
      // Keep a conflicting credential in encrypted review; never silently replace an existing secret.
      await c.query("SAVEPOINT extraction");
      try {
        const assignment = await this.materialize(c, messageId, group, {
          namespace: group.namespace,
          username: parsed.username!,
          displayName: parsed.displayName!,
          ...(parsed.password ? { password: parsed.password } : {}),
        });
        await event(c, "MESSAGE_PROCESSED", assignment.id);
        return {
          id: messageId,
          state: "PROCESSED",
          assignmentId: assignment.id,
        };
      } catch (e) {
        if (
          !(e instanceof Fault) ||
          !["CREDENTIAL_CONFLICT", "ACCOUNT_ARCHIVED"].includes(e.code)
        )
          throw e;
        await c.query("ROLLBACK TO SAVEPOINT extraction");
        await c.query(
          "UPDATE source_messages SET review_account_id=(SELECT id FROM accounts WHERE namespace=$2 AND username_normalized=$3) WHERE id=$1",
          [messageId, normalize(group.namespace), normalize(parsed.username!)],
        );
        await event(c, "CREDENTIAL_REVIEW_REQUIRED", messageId);
        return { id: messageId, state: "REVIEW" };
      }
    });
  }
  async materialize(
    c: PoolClient,
    messageId: string,
    group: any,
    input: {
      namespace: string;
      username: string;
      displayName: string;
      password?: string;
    },
  ) {
    const account = await this.account(c, input);
    if (account.archived_at) throw new Fault("ACCOUNT_ARCHIVED");
    const assignment = (
      await c.query(
        `INSERT INTO assignments(id,account_id,task_type_id,period_key,priority) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(account_id,task_type_id,period_key) DO UPDATE SET priority=GREATEST(assignments.priority,EXCLUDED.priority),version=assignments.version+CASE WHEN EXCLUDED.priority>assignments.priority THEN 1 ELSE 0 END RETURNING *`,
        [
          randomUUID(),
          account.id,
          group.task_type_id,
          group.period_key,
          group.priority ?? 0,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO assignment_sources VALUES($1,$2) ON CONFLICT DO NOTHING",
      [assignment.id, messageId],
    );
    await c.query(
      "UPDATE source_messages SET state='PROCESSED',encrypted_payload=NULL,version=version+1 WHERE id=$1",
      [messageId],
    );
    // Aggregate version invalidates deletion previews when a new task/source arrives.
    await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
      account.id,
    ]);
    return assignment;
  }
  async approval(c: PoolClient, purpose: string, payload: unknown) {
    const value = token();
    await c.query(
      "INSERT INTO approvals(token_hash,purpose,payload,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",
      [hash(value), purpose, JSON.stringify(payload)],
    );
    return value;
  }
  private async ingressSnapshot(c: PoolClient) {
    await c.query("SELECT pg_advisory_xact_lock(8240005)");
    const r = (
      await c.query(
        "SELECT count(*)::int count,COALESCE(max(id),0)::text head FROM whatsapp_ingress WHERE state IN ('PENDING','ERROR')",
      )
    ).rows[0];
    return { stamp: JSON.stringify(r), count: r.count };
  }
  private async purgeIngress(
    c: PoolClient,
    ids: string[],
    all: boolean,
    assignment?: { task_type_id: string; period_key: string },
  ) {
    if (all) {
      await c.query(
        "UPDATE whatsapp_ingress SET state='DROPPED',encrypted_payload=NULL WHERE state IN ('PENDING','ERROR')",
      );
      return;
    }
    const accounts = (
      await c.query(
        "SELECT namespace,username_normalized FROM accounts WHERE id=ANY($1::uuid[])",
        [ids],
      )
    ).rows;
    const pending = (
      await c.query(
        "SELECT q.*,g.namespace,g.task_type_id,g.period_key FROM whatsapp_ingress q JOIN groups g ON g.id=q.group_id WHERE q.state IN ('PENDING','ERROR') ORDER BY q.id LIMIT 1001 FOR UPDATE OF q",
      )
    ).rows;
    if (pending.length > 1000)
      throw new Fault("INGRESS_BACKLOG_REQUIRES_REVIEW");
    for (const row of pending) {
      const item = JSON.parse(
        this.vault.open(
          row.encrypted_payload,
          `wa-ingress:${row.session_id}:${row.group_id}:${hash(row.external_message_id)}`,
        ),
      );
      const parsed = parseMessage(item.text);
      if (
        !parsed.username ||
        !accounts.some(
          (a) =>
            a.namespace === normalize(row.namespace) &&
            a.username_normalized === normalize(parsed.username!),
        )
      )
        continue;
      if (assignment) {
        if (assignment.period_key !== row.period_key) continue;
        const rules = (
          await c.query(
            "SELECT * FROM group_rules WHERE group_id=$1 AND enabled=true",
            [row.group_id],
          )
        ).rows;
        const route = routeTask(item.text, rules, row.task_type_id);
        // An ambiguous matching account could recreate the deleted task after review.
        if (!route.ambiguous && route.taskTypeId !== assignment.task_type_id)
          continue;
      }
      await c.query(
        "UPDATE whatsapp_ingress SET state='DROPPED',encrypted_payload=NULL WHERE id=$1",
        [row.id],
      );
    }
  }
  async assignmentDeletionPreview(assignmentId: string) {
    return transaction(this.pool, async (c) => {
      const ingress = await this.ingressSnapshot(c);
      const row = (
        await c.query(
          "SELECT a.*,ac.version account_version,ac.display_name,t.name task_name FROM assignments a JOIN accounts ac ON ac.id=a.account_id JOIN task_types t ON t.id=a.task_type_id WHERE a.id=$1 FOR SHARE OF a,ac",
          [assignmentId],
        )
      ).rows[0];
      if (!row) throw new Fault("NOT_FOUND", 404);
      const replies = Number(
        (
          await c.query(
            "SELECT count(*) FROM reply_jobs WHERE assignment_id=$1",
            [assignmentId],
          )
        ).rows[0].count,
      );
      return {
        assignmentId,
        displayName: row.display_name,
        taskName: row.task_name,
        replies,
        confirmation: "DELETE TASK",
        pendingIngress: ingress.count,
        approvalToken: await this.approval(c, "delete-assignment", {
          assignmentId,
          version: row.version,
          accountId: row.account_id,
          accountVersion: row.account_version,
          ingressStamp: ingress.stamp,
        }),
      };
    });
  }
  async deleteAssignment(
    assignmentId: string,
    value: string,
    confirmation: string,
  ) {
    return transaction(this.pool, async (c) => {
      const ingress = await this.ingressSnapshot(c);
      const p = await this.consume(c, value, "delete-assignment");
      if (p.ingressStamp !== ingress.stamp) throw new Fault("STALE_PREVIEW");
      if (p.assignmentId !== assignmentId || confirmation !== "DELETE TASK")
        throw new Fault("DELETION_REQUIRES_CONFIRMATION");
      const account = (
        await c.query("SELECT version FROM accounts WHERE id=$1 FOR UPDATE", [
          p.accountId,
        ])
      ).rows[0];
      const assignment = (
        await c.query(
          "SELECT version,task_type_id,period_key FROM assignments WHERE id=$1 FOR UPDATE",
          [assignmentId],
        )
      ).rows[0];
      if (
        !account ||
        !assignment ||
        account.version !== p.accountVersion ||
        assignment.version !== p.version
      )
        throw new Fault("STALE_PREVIEW");
      const jobs = (
        await c.query(
          "SELECT id,status FROM reply_jobs WHERE assignment_id=$1 FOR UPDATE",
          [assignmentId],
        )
      ).rows;
      if (jobs.some((j) => ["SENDING", "UNKNOWN_DELIVERY"].includes(j.status)))
        throw new Fault("DELIVERY_REQUIRES_RECONCILIATION");
      const sources = (
        await c.query(
          "SELECT source_message_id FROM assignment_sources WHERE assignment_id=$1",
          [assignmentId],
        )
      ).rows.map((r) => r.source_message_id);
      await this.purgeIngress(c, [p.accountId], false, assignment);
      await c.query("DELETE FROM assignments WHERE id=$1", [assignmentId]);
      await c.query(
        "DELETE FROM source_messages s WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM assignment_sources x WHERE x.source_message_id=s.id)",
        [sources],
      );
      await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
        p.accountId,
      ]);
      await event(c, "ASSIGNMENT_PURGED", assignmentId);
      return { deleted: 1, accountPreserved: true };
    });
  }
  async consume(c: PoolClient, value: string, purpose: string) {
    const result = await c.query(
      "UPDATE approvals SET consumed_at=now() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING payload",
      [hash(value), purpose],
    );
    if (!result.rowCount) throw new Fault("APPROVAL_EXPIRED_OR_CONSUMED");
    return result.rows[0].payload;
  }
  async replyPreview(input: {
    assignmentId: string;
    sourceMessageId: string;
    templateId: string;
  }) {
    return transaction(this.pool, async (c) => {
      const row = (
        await c.query(
          `SELECT a.id,a.version,a.status,s.id source_id,s.session_id,s.external_message_id,g.id group_id,g.title,g.enabled,g.version group_version,
        t.body,t.id template_id,t.version template_version,t.enabled template_enabled,t.group_id template_group_id,t.task_type_id template_task_id,a.task_type_id,ac.display_name,ac.archived_at,tt.name task_name,ws.provider
        FROM assignments a JOIN accounts ac ON ac.id=a.account_id JOIN task_types tt ON tt.id=a.task_type_id
        JOIN assignment_sources axs ON axs.assignment_id=a.id JOIN source_messages s ON s.id=axs.source_message_id
        JOIN groups g ON g.id=s.group_id JOIN whatsapp_sessions ws ON ws.id=s.session_id CROSS JOIN reply_templates t
        WHERE a.id=$1 AND s.id=$2 AND t.id=$3`,
          [input.assignmentId, input.sourceMessageId, input.templateId],
        )
      ).rows[0];
      if (!row || row.archived_at || !row.enabled)
        throw new Fault("REPLY_TARGET_UNAVAILABLE");
      if (!row.template_enabled) throw new Fault("TEMPLATE_NOT_AVAILABLE");
      if (
        (row.template_group_id && row.template_group_id !== row.group_id) ||
        (row.template_task_id && row.template_task_id !== row.task_type_id)
      )
        throw new Fault("TEMPLATE_SCOPE_MISMATCH");
      const body = row.body
        .replaceAll("{displayName}", row.display_name)
        .replaceAll("{taskName}", row.task_name);
      if (body.includes("{") || body.includes("}"))
        throw new Fault("UNSAFE_TEMPLATE");
      const approvalToken = await this.approval(c, "reply", {
        ...input,
        version: row.version,
        groupVersion: row.group_version,
        templateVersion: row.template_version,
        sessionId: row.session_id,
        body,
      });
      return {
        approvalToken,
        body,
        sessionId: row.session_id,
        groupId: row.group_id,
        groupTitle: row.title,
        externalMessageId: row.external_message_id,
        provider: row.provider,
        expiresInSeconds: 300,
      };
    });
  }
  async approveReply(value: string, key: string, allowLive = false) {
    return transaction(this.pool, async (c) => {
      const p = await this.consume(c, value, "reply");
      const session = (
        await c.query("SELECT provider FROM whatsapp_sessions WHERE id=$1", [
          p.sessionId,
        ])
      ).rows[0];
      if (session?.provider !== "mock" && !allowLive)
        throw new Fault("LIVE_SENDING_NOT_AUTHORIZED", 403);
      await c.query(
        "SELECT ac.id FROM accounts ac JOIN assignments a ON a.account_id=ac.id WHERE a.id=$1 FOR UPDATE OF ac",
        [p.assignmentId],
      );
      const target = (
        await c.query(
          `SELECT a.version,g.version group_version,g.enabled,ac.archived_at,t.version template_version,t.enabled template_enabled,(t.group_id IS NULL OR t.group_id=g.id) AND (t.task_type_id IS NULL OR t.task_type_id=a.task_type_id) template_scope_valid FROM assignments a
        JOIN accounts ac ON ac.id=a.account_id JOIN assignment_sources axs ON axs.assignment_id=a.id
        JOIN source_messages s ON s.id=axs.source_message_id JOIN groups g ON g.id=s.group_id JOIN reply_templates t ON t.id=$3
        WHERE a.id=$1 AND s.id=$2 FOR UPDATE OF a,ac,g,t`,
          [p.assignmentId, p.sourceMessageId, p.templateId],
        )
      ).rows[0];
      if (
        !target ||
        target.version !== p.version ||
        target.group_version !== p.groupVersion ||
        target.template_version !== p.templateVersion ||
        !target.template_enabled ||
        !target.template_scope_valid ||
        !target.enabled ||
        target.archived_at
      )
        throw new Fault("STALE_PREVIEW");
      const prior = (
        await c.query("SELECT * FROM reply_jobs WHERE idempotency_key=$1", [
          key,
        ])
      ).rows[0];
      if (prior) {
        if (
          prior.assignment_id !== p.assignmentId ||
          prior.source_message_id !== p.sourceMessageId ||
          prior.body !== p.body
        )
          throw new Fault("IDEMPOTENCY_CONFLICT");
        return prior;
      }
      const job = (
        await c.query(
          `INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,'APPROVED',$7) RETURNING *`,
          [
            randomUUID(),
            p.assignmentId,
            p.sourceMessageId,
            p.sessionId,
            p.templateId,
            p.body,
            key,
          ],
        )
      ).rows[0];
      await c.query(
        "UPDATE accounts SET version=version+1 WHERE id=(SELECT account_id FROM assignments WHERE id=$1)",
        [p.assignmentId],
      );
      await event(c, "REPLY_APPROVED", job.id);
      return job;
    });
  }
  async deletionPreview(ids: string[] | undefined, all: boolean) {
    return transaction(this.pool, async (c) => {
      const ingress = await this.ingressSnapshot(c);
      const accounts = (
        await c.query(
          "SELECT id,version,display_name FROM accounts WHERE $1::boolean OR id=ANY($2::uuid[]) ORDER BY id FOR SHARE",
          [all, ids ?? []],
        )
      ).rows;
      if (!accounts.length) throw new Fault("NOT_FOUND", 404);
      if (accounts.length > 1000) throw new Fault("BATCH_TOO_LARGE", 400);
      const summary = (
        await c.query(
          `SELECT count(*)::int assignments,(SELECT count(*)::int FROM reply_jobs r JOIN assignments a ON a.id=r.assignment_id WHERE a.account_id=ANY($1::uuid[])) replies
        FROM assignments WHERE account_id=ANY($1::uuid[])`,
          [accounts.map((a) => a.id)],
        )
      ).rows[0];
      return {
        accounts,
        ...summary,
        pendingIngress: ingress.count,
        confirmation: `DELETE ${accounts.length}`,
        approvalToken: await this.approval(c, "delete", {
          accounts: accounts.map((a) => ({ id: a.id, version: a.version })),
          all,
          ingressStamp: ingress.stamp,
        }),
      };
    });
  }
  async deleteAccounts(value: string, confirmation: string) {
    return transaction(this.pool, async (c) => {
      const ingress = await this.ingressSnapshot(c);
      const p = await this.consume(c, value, "delete");
      if (p.ingressStamp !== ingress.stamp) throw new Fault("STALE_PREVIEW");
      const ids = p.accounts.map((a: any) => a.id);
      if (p.all)
        await c.query("LOCK TABLE accounts IN SHARE ROW EXCLUSIVE MODE");
      if (confirmation !== `DELETE ${ids.length}`)
        throw new Fault("DELETION_REQUIRES_CONFIRMATION");
      const current = (
        await c.query(
          "SELECT id,version FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [ids],
        )
      ).rows;
      if (JSON.stringify(current) !== JSON.stringify(p.accounts))
        throw new Fault("STALE_PREVIEW");
      if (
        p.all &&
        Number(
          (await c.query("SELECT count(*) FROM accounts")).rows[0].count,
        ) !== ids.length
      )
        throw new Fault("STALE_PREVIEW");
      const jobs = await c.query(
        `SELECT r.id,r.status FROM reply_jobs r JOIN assignments a ON a.id=r.assignment_id WHERE a.account_id=ANY($1::uuid[]) FOR UPDATE OF r`,
        [ids],
      );
      if (
        jobs.rows.some((r) =>
          ["SENDING", "UNKNOWN_DELIVERY"].includes(r.status),
        )
      )
        throw new Fault("DELIVERY_REQUIRES_RECONCILIATION");
      const sources = (
        await c.query(
          "SELECT DISTINCT source_message_id FROM assignment_sources s JOIN assignments a ON a.id=s.assignment_id WHERE a.account_id=ANY($1::uuid[])",
          [ids],
        )
      ).rows.map((r) => r.source_message_id);
      // Cancel pending jobs before cascading all personal records. Retain only redacted audit.
      await c.query(
        "UPDATE reply_jobs SET status='CANCELED' WHERE id=ANY($1::uuid[]) AND status='APPROVED'",
        [jobs.rows.map((r) => r.id)],
      );
      await this.purgeIngress(c, ids, p.all);
      await c.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [ids]);
      if (p.all) await c.query("DELETE FROM source_messages");
      await c.query(
        "DELETE FROM source_messages s WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM assignment_sources x WHERE x.source_message_id=s.id)",
        [sources],
      );
      await c.query(
        "UPDATE notifications SET subject_id=NULL WHERE subject_id=ANY($1::uuid[])",
        [ids],
      );
      // Approval snapshots are capability tokens; delete consumed/previewed payloads that reference removed identities.
      await c.query("DELETE FROM approvals");
      await event(c, "ACCOUNTS_PURGED");
      return { deleted: ids.length };
    });
  }
}
