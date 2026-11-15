import test from "node:test";
import assert from "node:assert/strict";
import { ChatProvider, projectMessageStructure } from "../src/ai.js";
import { parseMessage, selectedMessageFields } from "../src/parser.js";

test("opaque tokens require AI/human review rather than becoming automatic credentials", async () => {
  const raw = "اسم اختبار\nS299999991\nplaincanaryword";
  assert.equal(parseMessage(raw).needsReview, true);
  const safe = projectMessageStructure(raw, []);
  assert.equal(safe.layout?.[2]?.kind, "opaque");
  const provider = new ChatProvider(
    {
      provider: "deepseek",
      model: "synthetic-only",
      key: "synthetic-only",
      enabled: true,
      outboundApproved: true,
    },
    (async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                taskCode: null,
                confidence: 0.7,
                fieldSelection: { username: 1, displayName: 0, password: 2 },
              }),
            },
          },
        ],
      })) as typeof fetch,
  );
  const result = await provider.analyzeMessageRedacted(safe);
  assert.equal(
    selectedMessageFields(raw, result.fieldSelection!).password,
    "plaincanaryword",
  );
});

test("AI structural fallback sends only enumerated kinds/positions, and resolves no secret value externally", async () => {
  const body =
    "اسم تجريبي خاص\nS299999993\nFixtureCanary9!\nLaw121\nOtherCanary8!";
  const safe = projectMessageStructure(body, []);
  assert.deepEqual(safe, {
    candidateCodes: [],
    layout: [
      { index: 0, kind: "name" },
      { index: 1, kind: "username" },
      { index: 2, kind: "credential" },
      { index: 3, kind: "course" },
      { index: 4, kind: "credential" },
    ],
  });
  let transmitted = "",
    calls = 0;
  let selection = { username: 1, displayName: 0, password: 2 };
  const provider = new ChatProvider(
    {
      provider: "deepseek",
      model: "synthetic-only",
      key: "synthetic-only",
      enabled: true,
      outboundApproved: true,
    },
    (async (_url, init) => {
      transmitted = String(init?.body);
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                taskCode: null,
                confidence: 0.8,
                fieldSelection: selection,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 25 },
      });
    }) as typeof fetch,
  );
  const result = await provider.analyzeMessageRedacted(safe);
  assert.deepEqual(result.fieldSelection, selection);
  assert.equal(result.needsReview, true);
  assert.equal(calls, 1);
  for (const secret of [
    "اسم تجريبي خاص",
    "S299999993",
    "FixtureCanary9!",
    "OtherCanary8!",
    "Law121",
  ])
    assert.equal(transmitted.includes(secret), false);
  selection = { username: 1, displayName: 0, password: 3 };
  await assert.rejects(
    () => provider.analyzeMessageRedacted(safe),
    /AI_UNAVAILABLE/,
  );
  selection = { username: 2, displayName: 0, password: 2 };
  await assert.rejects(
    () => provider.analyzeMessageRedacted(safe),
    /AI_UNAVAILABLE/,
  );
  await assert.rejects(() =>
    provider.analyzeMessageRedacted({ ...safe, raw: body } as any),
  );
});
test("partial identifiers do not become AI-generated full identifiers; long layouts abstain", async () => {
  const provider = new ChatProvider(
    {
      provider: "deepseek",
      model: "synthetic-only",
      key: "synthetic-only",
      enabled: true,
      outboundApproved: true,
    },
    (async () => {
      throw Error("NO_PROVIDER_EXPECTED");
    }) as typeof fetch,
  );
  const partial = projectMessageStructure("S26000...\nFixtureCanary9!", []);
  assert.equal(
    (await provider.analyzeMessageRedacted(partial)).provenance,
    "local-abstention",
  );
  assert.deepEqual(
    projectMessageStructure(
      "S299999993\n" + Array(65).fill("Fixture9!").join("\n"),
      [],
    ),
    { candidateCodes: [] },
  );
});
