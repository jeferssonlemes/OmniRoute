import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CLAUDE_CODE_CLIENT_BILLING_VERSION } from "../../src/shared/constants/claudeCodeClient.ts";

describe("Anthropic billing header fingerprint (#1638)", () => {
  it("uses the captured empty-message billing fingerprint fallback", () => {
    assert.equal(CLAUDE_CODE_CLIENT_BILLING_VERSION, "2.1.291.926");
  });
});
