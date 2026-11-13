import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { ChatProvider, projectTaskCodes, type AiProvider } from "./ai.js";
import { Vault, hash } from "./security.js";
import { transaction, event } from "./db.js";
import { Fault } from "./service.js";
type ProviderName = "deepseek" | "openrouter";
type FactoryConfig = ConstructorParameters<typeof ChatProvider>[0];
export const aiSettingsInput = z
  .object({
    version: z.number().int().positive(),
    provider: z.enum(["deepseek", "openrouter"]),
    model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/),
    enabled: z.boolean(),
    outboundApproved: z.boolean(),
    dailyRequestLimit: z.number().int().min(1).max(100),
    dailyTokenLimit: z.number().int().min(1000).max(100000),
  })
  .strict();
export function estimatedAiCost(
  provider: string,
  model: string,
  prompt: number | null,
  completion: number | null,
  cacheHit: number | null = null,
): number | null {
  if (provider !== "deepseek" || prompt === null || completion === null)
    return null;
  const rate =
    model === "deepseek-flash"
      ? [0.006, 0.3, 1.2]
      : model === "deepseek-v4-pro"
        ? [0.044, 1.32, 3.96]
        : null;
  if (!rate) return null;
  const hit = Math.min(prompt, cacheHit ?? 0);
  return (
    (hit * rate[0]! + (prompt - hit) * rate[1]! + completion * rate[2]!) /
    1000000
  );
}
export class AiRuntime {
  constructor(
    private pool: pg.Pool,
    private vault: Vault,
    private key: (p: ProviderName) => Promise<string> = async (p) =>
      (
        await readFile(
          process.env[
            p === "deepseek"
              ? "DEEPSEEK_API_KEY_FILE"
              : "OPENROUTER_API_KEY_FILE"
          ] ?? `/etc/taskpilot/${p}-key`,
          "utf8",
        )
      ).trim(),
    private factory: (c: FactoryConfig) => AiProvider = (c) =>
      new ChatProvider(c),
  ) {}
  private async cfg() {
    return (await this.pool.query("SELECT * FROM ai_settings WHERE id=true"))
      .rows[0];
  }
  async recoverInterrupted() {
    await this.pool.query(
      "UPDATE ai_requests SET status='UNAVAILABLE',error_code='AI_PROCESS_INTERRUPTED',completed_at=now() WHERE status='REQUESTED'",
    );
  }
  private async provider(p: ProviderName, model: string) {
    let key = "";
    try {
      key = await this.key(p);
    } catch {}
    if (!key) throw new Fault("AI_CONFIGURATION_REQUIRED", 409);
    return this.factory({
      provider: p,
      model,
      key,
      enabled: true,
      outboundApproved: true,
    });
  }
  async settings() {
    const c = await this.cfg();
    let configured = false;
    try {
      configured = !!(await this.key(c.provider));
    } catch {}
    return {
      version: c.version,
      provider: c.provider,
      model: c.model,
      enabled: c.enabled,
      outboundApproved: c.outbound_approved,
      dailyRequestLimit: c.daily_request_limit,
      dailyTokenLimit: c.daily_token_limit,
      keyConfigured: configured,
      privacy: "task-codes-only",
      automaticActions: false,
    };
  }
  async models(p: ProviderName) {
    try {
      return {
        provider: p,
        models: await (await this.provider(p, "catalog")).listModels(),
      };
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault("AI_UNAVAILABLE", 503);
    }
  }
  async configure(raw: unknown) {
    const p = aiSettingsInput.parse(raw);
    if (p.enabled && p.outboundApproved) {
      const list = await this.models(p.provider);
      if (!list.models.includes(p.model))
        throw new Fault("AI_MODEL_UNAVAILABLE", 409);
    }
    return transaction(this.pool, async (c) => {
      const r = await c.query(
        "UPDATE ai_settings SET provider=$2,model=$3,enabled=$4,outbound_approved=$5,daily_request_limit=$6,daily_token_limit=$7,version=version+1,updated_at=now() WHERE id=true AND version=$1 RETURNING version",
        [
          p.version,
          p.provider,
          p.model,
          p.enabled,
          p.outboundApproved,
          p.dailyRequestLimit,
          p.dailyTokenLimit,
        ],
      );
      if (!r.rowCount) throw new Fault("CONFLICT");
      await event(c, "AI_SETTINGS_UPDATED");
      return { ok: true, version: r.rows[0].version };
    });
  }
  private async projection(sourceId: string) {
    const source = (
      await this.pool.query(
        "SELECT s.id,s.version,s.state,s.encrypted_payload,s.group_id FROM source_messages s WHERE s.id=$1",
        [sourceId],
      )
    ).rows[0];
    if (!source) throw new Fault("NOT_FOUND", 404);
    if (source.state !== "REVIEW" || !source.encrypted_payload)
      throw new Fault("AI_REVIEW_SOURCE_REQUIRED", 409);
    const rules = (
      await this.pool.query(
        "SELECT t.code,r.keywords FROM group_rules r JOIN task_types t ON t.id=r.task_type_id WHERE r.group_id=$1 AND r.enabled ORDER BY r.priority DESC,r.id LIMIT 20",
        [source.group_id],
      )
    ).rows;
    return {
      source,
      safe: projectTaskCodes(
        this.vault.open(source.encrypted_payload, `message:${source.id}`),
        rules,
      ),
    };
  }
  async preview(sourceId: string) {
    const p = await this.projection(sourceId),
      c = await this.cfg();
    return {
      sourceVersion: p.source.version,
      settingsVersion: c.version,
      candidateCodes: p.safe.candidateCodes,
      privacy: "task-codes-only",
      needsReview: true,
      providerRequestSent: false,
    };
  }
  private async result(row: any, reused: boolean) {
    const type = row.task_code
      ? ((
          await this.pool.query("SELECT id FROM task_types WHERE code=$1", [
            row.task_code,
          ])
        ).rows[0]?.id ?? null)
      : null;
    return {
      requestId: row.id,
      status: row.status,
      taskCode: row.task_code ?? null,
      taskTypeId: type,
      confidence: row.confidence ?? 0,
      needsReview: true,
      sourceVersion: row.source_version,
      model: row.model,
      provider: row.provider,
      reused,
      promptTokens: row.prompt_tokens ?? null,
      completionTokens: row.completion_tokens ?? null,
      estimatedCostUsd:
        row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
      reportedCostUsd:
        row.reported_cost_usd === null ? null : Number(row.reported_cost_usd),
      automaticActions: false,
    };
  }
  async analyze(sourceId: string, idempotencyKey: string) {
    const c = await this.cfg();
    if (!c.enabled || !c.outbound_approved) throw new Fault("AI_DISABLED", 403);
    const { source, safe } = await this.projection(sourceId);
    if (!safe.candidateCodes.length)
      return {
        status: "ABSTAINED",
        reused: false,
        taskCode: null,
        taskTypeId: null,
        confidence: 0,
        needsReview: true,
        providerRequestSent: false,
        automaticActions: false,
      };
    const provider = await this.provider(c.provider, c.model),
      reserved = Buffer.byteLength(JSON.stringify(safe), "utf8") + 768;
    const selected = await transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(8240007)");
      const prior = (
        await db.query("SELECT * FROM ai_requests WHERE idempotency_hash=$1", [
          hash(idempotencyKey),
        ])
      ).rows[0];
      if (prior) {
        if (
          prior.source_id !== sourceId ||
          prior.source_version !== source.version ||
          prior.settings_version !== c.version
        )
          throw new Fault("AI_IDEMPOTENCY_CONFLICT", 409);
        return { row: prior, reused: true };
      }
      const current = (
        await db.query(
          "SELECT version,enabled,outbound_approved FROM ai_settings WHERE id=true",
        )
      ).rows[0];
      if (
        current.version !== c.version ||
        !current.enabled ||
        !current.outbound_approved
      )
        throw new Fault("CONFLICT");
      const fresh = (
        await db.query(
          "SELECT state,version FROM source_messages WHERE id=$1 FOR SHARE",
          [sourceId],
        )
      ).rows[0];
      if (
        !fresh ||
        fresh.state !== "REVIEW" ||
        fresh.version !== source.version
      )
        throw new Fault("CONFLICT");
      const spent = (
        await db.query(
          "SELECT count(*)::int requests,COALESCE(sum(CASE WHEN prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL THEN prompt_tokens+completion_tokens ELSE reserved_tokens END),0)::int tokens FROM ai_requests WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
        )
      ).rows[0];
      if (
        spent.requests >= c.daily_request_limit ||
        spent.tokens + reserved > c.daily_token_limit
      )
        throw new Fault("AI_DAILY_LIMIT", 429);
      const row = (
        await db.query(
          "INSERT INTO ai_requests(id,idempotency_hash,source_id,source_version,settings_version,provider,model,status,candidate_codes,reserved_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,$9) RETURNING *",
          [
            randomUUID(),
            hash(idempotencyKey),
            sourceId,
            source.version,
            c.version,
            c.provider,
            c.model,
            JSON.stringify(safe.candidateCodes),
            reserved,
          ],
        )
      ).rows[0];
      return { row, reused: false };
    });
    if (selected.reused) return this.result(selected.row, true);
    try {
      const result = await provider.analyzeMessageRedacted(safe);
      const estimate = estimatedAiCost(
        c.provider,
        c.model,
        result.promptTokens,
        result.completionTokens,
        result.cacheHitTokens ?? null,
      );
      const row = (
        await this.pool.query(
          "UPDATE ai_requests SET status='SUCCEEDED',task_code=$2,confidence=$3,prompt_tokens=$4,completion_tokens=$5,estimated_cost_usd=$6,reported_cost_usd=$7,completed_at=now() WHERE id=$1 RETURNING *",
          [
            selected.row.id,
            result.taskCode,
            result.confidence,
            result.promptTokens,
            result.completionTokens,
            estimate,
            result.reportedCostUsd ?? null,
          ],
        )
      ).rows[0];
      return this.result(row, false);
    } catch {
      const row = (
        await this.pool.query(
          "UPDATE ai_requests SET status='UNAVAILABLE',error_code='AI_UNAVAILABLE',completed_at=now() WHERE id=$1 RETURNING *",
          [selected.row.id],
        )
      ).rows[0];
      return this.result(row, false);
    }
  }
  async usage() {
    const today = (
      await this.pool.query(
        'SELECT count(*)::int requests,count(*) FILTER(WHERE status=\'SUCCEEDED\')::int succeeded,COALESCE(sum(prompt_tokens),0)::int "promptTokens",COALESCE(sum(completion_tokens),0)::int "completionTokens",COALESCE(sum(reserved_tokens) FILTER(WHERE prompt_tokens IS NULL OR completion_tokens IS NULL),0)::int "unresolvedReservedTokens",sum(estimated_cost_usd) "estimatedCostUsd",sum(reported_cost_usd) "reportedCostUsd" FROM ai_requests WHERE created_at>=date_trunc(\'day\',now() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',
      )
    ).rows[0];
    const recent = (
      await this.pool.query(
        "SELECT id,status,provider,model,task_code,confidence,prompt_tokens,completion_tokens,estimated_cost_usd,reported_cost_usd,created_at FROM ai_requests ORDER BY created_at DESC LIMIT 20",
      )
    ).rows;
    return {
      today,
      recent,
      costBasis:
        "DeepSeek peak-rate estimate verified2026-11-14; not a confirmed charge. Unknown billed requests retain token reservations.",
    };
  }
}
