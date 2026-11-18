import assert from "node:assert/strict";
import test from "node:test";
import { markdownAccount } from "../src/account-export.js";

test("credential Markdown preserves literal values and protects fences and names", () => {
  assert.equal(
    markdownAccount("اسم", "username", "Password!42"),
    "اسم\n```\nusername\nPassword!42\n```",
  );
  assert.equal(
    markdownAccount("# A\n<B>", "username", "abc```\n---"),
    "\\# A \\<B\\>\n````\nusername\nabc```\n---\n````",
  );
  assert.match(
    markdownAccount("اسم", "username", null),
    /كلمة المرور غير مسجلة/,
  );
});
