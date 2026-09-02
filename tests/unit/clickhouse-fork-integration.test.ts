import test from "node:test";
import assert from "node:assert/strict";

import { resolveChatLogSessionId } from "../../open-sse/handlers/chatCore/headers.ts";

test("resolveChatLogSessionId prefers supported client headers", () => {
  assert.equal(
    resolveChatLogSessionId(
      {
        "X-Claude-Code-Session-Id": "claude-session",
        "x-opencode-session": "opencode-session",
      },
      { prompt_cache_key: "body-session" }
    ),
    "claude-session"
  );
  assert.equal(
    resolveChatLogSessionId({ "X-OpenCode-Session": "opencode-session" }, null),
    "opencode-session"
  );
});

test("resolveChatLogSessionId reads Claude metadata and Codex body identifiers", () => {
  assert.equal(
    resolveChatLogSessionId(null, {
      metadata: { user_id: JSON.stringify({ session_id: "claude-body-session" }) },
    }),
    "claude-body-session"
  );
  assert.equal(
    resolveChatLogSessionId(null, {
      prompt_cache_key: " codex-cache-key ",
      session_id: "lower-priority-session",
    }),
    "codex-cache-key"
  );
  assert.equal(
    resolveChatLogSessionId(null, { conversation_id: "conversation-session" }),
    "conversation-session"
  );
});

test("resolveChatLogSessionId ignores malformed or empty session values", () => {
  assert.equal(
    resolveChatLogSessionId(null, {
      metadata: { user_id: "{not-json" },
      prompt_cache_key: " ",
      session_id: 123,
    }),
    null
  );
});

test("ClickHouse logger is a no-op before initialization", async () => {
  const { emitClickHouseLog } = await import("../../src/lib/plugins/clickhouseLogger.ts");
  assert.doesNotThrow(() =>
    emitClickHouseLog({
      id: "request-1",
      model: "test-model",
      provider: "test-provider",
      status: 200,
    })
  );
});
