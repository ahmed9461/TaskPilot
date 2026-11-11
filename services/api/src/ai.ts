import { z } from "zod";
// Codes are administrator-authored task vocabulary, never extracted account identifiers.
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const input = z.object({ candidateCodes: z.array(code).max(20) }).strict();
export type RedactedMessage = z.infer<typeof input>;
export function projectTaskCodes(
  raw: string,
  rules: ReadonlyArray<{ code: string; keywords: readonly string[] }>,
): RedactedMessage {
  if (raw.length > 16000 || rules.length > 20)
    throw new Error("AI_INPUT_REJECTED");
  return input.parse({
    candidateCodes: [
      ...new Set(
        rules
          .filter((r) =>
            r.keywords.some((k) => k.length > 0 && raw.includes(k)),
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
    if (!safe.candidateCodes.length)
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
              'Return JSON only: {"taskCode":null,"confidence":0}. Choose only a supplied candidate code or null. Do not invent identifiers or perform any actions.',
          },
          { role: "user", content: JSON.stringify(safe) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 256,
        stream: false,
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
            })
            .optional(),
        })
        .parse(response);
      if (envelope.choices[0]!.finish_reason !== "stop") throw Error();
      const result = z
        .object({
          taskCode: code.nullable(),
          confidence: z.number().min(0).max(1),
        })
        .strict()
        .parse(JSON.parse(envelope.choices[0]!.message.content));
      if (
        result.taskCode !== null &&
        !safe.candidateCodes.includes(result.taskCode)
      )
        throw Error();
      return {
        ...result,
        needsReview: true,
        provenance: `${this.config.provider}:${this.config.model}`,
        promptTokens: envelope.usage?.prompt_tokens ?? null,
        completionTokens: envelope.usage?.completion_tokens ?? null,
      };
    } catch {
      throw new Error("AI_UNAVAILABLE");
    }
  }
}
