import test from "node:test";
import assert from "node:assert/strict";
import { ChatProvider, projectTaskCodes } from "../src/ai.js";
const config = {
  provider: "deepseek" as const,
  model: "synthetic-model",
  key: "synthetic-provider-key",
  enabled: true,
  outboundApproved: true,
};
test("AI disabled by default and no external request without outbound approval", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    throw Error();
  }) as typeof fetch;
  const p = new ChatProvider({ ...config, outboundApproved: false }, request);
  assert.equal(await p.health(), "DISABLED");
  await assert.rejects(
    () => p.analyzeMessageRedacted({ candidateCodes: ["self_check"] }),
    /AI_DISABLED/,
  );
  assert.equal(calls, 0);
});
test("allowlist projection sends task codes only, never message/name/password/username", async () => {
  const safe = projectTaskCodes(
    "الاسم: Fixture\nuser: demo-private\npassword: secret-canary\nالذاتي",
    [{ code: "self_check", keywords: ["الذاتي"] }],
  );
  let transmitted = "";
  const p = new ChatProvider(config, (async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    transmitted = String(init?.body);
    assert.equal(init?.redirect, "error");
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: '{"taskCode":"self_check","confidence":0.7}' },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
  }) as typeof fetch);
  const result = await p.analyzeMessageRedacted(safe);
  for (const secret of ["demo-private", "secret-canary", "Fixture", "الاسم"])
    assert.equal(transmitted.includes(secret), false);
  assert.equal(result.needsReview, true);
  assert.equal(result.taskCode, "self_check");
  assert.equal(result.promptTokens, 12);
});
test("OpenRouter endpoint and malformed/untrusted outputs fail closed", async () => {
  let calls = 0;
  const p = new ChatProvider({ ...config, provider: "openrouter" }, (async (
    url,
  ) => {
    calls++;
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: '{"taskCode":"invented","confidence":1}' },
        },
      ],
    });
  }) as typeof fetch);
  await assert.rejects(
    () => p.analyzeMessageRedacted({ candidateCodes: ["self_check"] }),
    /AI_UNAVAILABLE/,
  );
  assert.equal(calls, 1);
  const noCandidates = await p.analyzeMessageRedacted({ candidateCodes: [] });
  assert.equal(noCandidates.taskCode, null);
  assert.equal(calls, 1);
  await assert.rejects(() =>
    p.analyzeMessageRedacted({ candidateCodes: ["account@example.invalid"] }),
  );
  assert.equal(calls, 1);
});
test("provider timeout/rejection is sanitized and cannot interrupt durable ingest", async () => {
  const p = new ChatProvider(config, (async () => {
    throw Error("raw-provider-secret");
  }) as typeof fetch);
  await assert.rejects(
    () => p.analyzeMessageRedacted({ candidateCodes: ["self_check"] }),
    (e) => (e as Error).message === "AI_UNAVAILABLE",
  );
  assert.equal(p.estimatedCost(), null);
});
