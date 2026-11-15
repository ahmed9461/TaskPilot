import { z } from "zod";
import { routingContext } from "./rules.js";
import {
  hasAccountHint,
  messageSegments,
  opaqueCredentialCandidate,
  type FieldSelection,
} from "./parser.js";
// Codes are administrator-authored task vocabulary, never extracted account identifiers.
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const fieldSelection = z
  .object({
    username: z.number().int().min(0).max(59).nullable(),
    displayName: z.number().int().min(0).max(59).nullable(),
    password: z.number().int().min(0).max(59).nullable(),
  })
  .strict();
const input = z
  .object({
    candidateCodes: z.array(code).max(20),
    layout: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(59),
            kind: z.enum([
              "username",
              "name",
              "credential",
              "course",
              "text",
              "partial",
              "opaque",
            ]),
          })
          .strict(),
      )
      .max(60)
      .optional(),
  })
  .strict();
export type RedactedMessage = z.infer<typeof input>;
// Only enumerated kinds and integer positions leave the server. Values stay encrypted/local.
export function projectMessageStructure(
  raw: string,
  rules: ReadonlyArray<{ code: string; keywords: readonly string[] }>,
): RedactedMessage {
  const safe = projectTaskCodes(raw, rules);
  const segments = messageSegments(raw);
  if (hasAccountHint(raw) && segments.length <= 60)
    return input.parse({
      ...safe,
      layout: segments.map((s) => ({
        index: s.index,
        kind:
          s.kind === "text" && opaqueCredentialCandidate(s.value)
            ? "opaque"
            : s.kind,
      })),
    });
  return safe;
}
export function projectTaskCodes(
  raw: string,
  rules: ReadonlyArray<{ code: string; keywords: readonly string[] }>,
): RedactedMessage {
  if (raw.length > 16000 || rules.length > 20)
    throw new Error("AI_INPUT_REJECTED");
  const context = routingContext(raw);
  return input.parse({
    candidateCodes: [
      ...new Set(
        rules
          .filter(
            (r) =>
              code.safeParse(r.code).success &&
              r.keywords.some(
                (k) =>
                  k.length > 0 &&
                  context.includes(k.normalize("NFKC").toLowerCase()),
              ),
          )
          .map((r) => r.code),
      ),
    ],
  });
}
export interface AiResult {
  taskCode: string | null;
  confidence: number;
  needsReview: true;
  provenance: string;
  promptTokens: number | null;
  completionTokens: number | null;
  reportedCostUsd?: number | null;
  cacheHitTokens?: number | null;
  fieldSelection?: FieldSelection | null;
}
export interface AiProvider {
  listModels(): Promise<string[]>;
  analyzeMessageRedacted(message: RedactedMessage): Promise<AiResult>;
  health(): Promise<"AVAILABLE" | "DISABLED" | "UNAVAILABLE">;
  estimatedCost(): null;
}
export class ChatProvider implements AiProvider {
  constructor(
    private config: {
      provider: "deepseek" | "openrouter";
      model: string;
      key: string;
      enabled: boolean;
      outboundApproved: boolean;
    },
    private request: typeof fetch = fetch,
  ) {}
  private gate() {
    if (!this.config.enabled || !this.config.outboundApproved)
      throw new Error("AI_DISABLED");
    if (!this.config.key || !this.config.model)
      throw new Error("AI_CONFIGURATION_REQUIRED");
  }
  private base() {
    return this.config.provider === "deepseek"
      ? "https://api.deepseek.com"
      : "https://openrouter.ai/api/v1";
  }
  private async call(path: string, body?: unknown) {
    this.gate();
    const response = await this.request(this.base() + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.config.key}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error("AI_UNAVAILABLE");
    // Bound responses before JSON parsing. Never log provider bodies or return free-form reasoning.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("AI_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new Error("AI_RESPONSE_TOO_LARGE");
      }
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async listModels() {
    try {
      const result = await this.call("/models");
      return z
        .object({
          data: z.array(z.object({ id: z.string().max(200) })).max(10000),
        })
        .parse(result)
        .data.map((m) => m.id);
    } catch {
      throw new Error("AI_UNAVAILABLE");
    }
  }
  async health() {
    if (!this.config.enabled || !this.config.outboundApproved)
      return "DISABLED" as const;
    try {
      await this.listModels();
      return "AVAILABLE" as const;
    } catch {
      return "UNAVAILABLE" as const;
    }
  }
  estimatedCost() {
    return null;
  }
  async analyzeMessageRedacted(message: RedactedMessage): Promise<AiResult> {
    this.gate();
    const safe = input.parse(message);
    const canSelectFields =
      safe.layout?.some((s) => s.kind === "username") &&
      safe.layout.some(
        (s) =>
          s.kind === "credential" || s.kind === "opaque" || s.kind === "name",
      );
    if (!safe.candidateCodes.length && !canSelectFields)
      return {
        taskCode: null,
        confidence: 0,
        needsReview: true,
        provenance: "local-abstention",
        promptTokens: 0,
        completionTokens: 0,
      };
    try {
      const response = await this.call("/chat/completions", {
        model: this.config.model,
        messages: [
          {
            role: "system",
            content:
              'Return JSON only: {"taskCode":null,"confidence":0,"fieldSelection":{"username":null,"displayName":null,"password":null}}. Choose taskCode only from supplied candidateCodes or null. layout contains structural segment kinds and integer indices, no values. For fieldSelection choose at most one supplied username index, one name index and one credential or opaque-token index for password, or null when unclear. Never select course/text/partial as credentials or username. Indices must be distinct. Infer no missing data and perform no actions. This is a review suggestion only.',
          },
          { role: "user", content: JSON.stringify(safe) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 256,
        stream: false,
        ...(this.config.provider === "deepseek"
          ? { thinking: { type: "disabled" } }
          : { provider: { data_collection: "deny", zdr: true } }),
      });
      const envelope = z
        .object({
          choices: z
            .array(
              z.object({
                message: z.object({ content: z.string().max(4096) }),
                finish_reason: z.string(),
              }),
            )
            .min(1),
          usage: z
            .object({
              prompt_tokens: z.number().int().min(0).optional(),
              completion_tokens: z.number().int().min(0).optional(),
              prompt_cache_hit_tokens: z.number().int().min(0).optional(),
              cost: z.number().min(0).optional(),
            })
            .optional(),
        })
        .parse(response);
      if (envelope.choices[0]!.finish_reason !== "stop") throw Error();
      const result = z
        .object({
          taskCode: code.nullable(),
          confidence: z.number().min(0).max(1),
          fieldSelection: fieldSelection.nullable().optional(),
        })
        .strict()
        .parse(JSON.parse(envelope.choices[0]!.message.content));
      if (
        result.taskCode !== null &&
        !safe.candidateCodes.includes(result.taskCode)
      )
        throw Error();
      if (result.fieldSelection) {
        const seen = new Set<number>();
        for (const [role, kind] of [
          ["username", "username"],
          ["displayName", "name"],
          ["password", "credential"],
        ] as const) {
          const index = result.fieldSelection[role];
          if (index === null) continue;
          if (
            seen.has(index) ||
            !safe.layout?.some(
              (s) =>
                s.index === index &&
                (s.kind === kind ||
                  (role === "password" && s.kind === "opaque")),
            )
          )
            throw Error();
          seen.add(index);
        }
      }
      return {
        ...result,
        needsReview: true,
        provenance: `${this.config.provider}:${this.config.model}`,
        promptTokens: envelope.usage?.prompt_tokens ?? null,
        completionTokens: envelope.usage?.completion_tokens ?? null,
        cacheHitTokens: envelope.usage?.prompt_cache_hit_tokens ?? null,
        reportedCostUsd: envelope.usage?.cost ?? null,
      };
    } catch {
      throw new Error("AI_UNAVAILABLE");
    }
  }
}
