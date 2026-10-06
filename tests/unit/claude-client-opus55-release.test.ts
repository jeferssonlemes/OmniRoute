import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CLAUDE_CODE_CLIENT_BUILD_REVISION,
  CLAUDE_CODE_CLIENT_VERSION,
  CLAUDE_CODE_RUNTIME_VERSION,
  CLAUDE_CODE_SDK_PACKAGE_VERSION,
} from "../../src/shared/constants/claudeCodeClient.ts";
import { computeFingerprint } from "../../open-sse/services/claudeCodeFingerprint.ts";

const captured = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures/claude-code/2.1.291-profile.json"),
    "utf8"
  )
) as {
  version: string;
  sdkPackageVersion: string;
  runtimeVersion: string;
  fingerprintSalt: string;
  billingSuffixForEmptyUserMessage: string;
};

test("the Claude profile matches the official 2.1.291 distribution", () => {
  assert.equal(CLAUDE_CODE_CLIENT_VERSION, captured.version);
  assert.equal(CLAUDE_CODE_SDK_PACKAGE_VERSION, captured.sdkPackageVersion);
  assert.equal(CLAUDE_CODE_RUNTIME_VERSION, captured.runtimeVersion);
});

test("the bundled Claude CLI is pinned to the same release as its wire identity", () => {
  const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
  const match = dockerfile.match(/@anthropic-ai\/claude-code@(\d+\.\d+\.\d+)/);
  assert.ok(match, "runner-cli must install an explicitly versioned Claude Code package");
  assert.equal(match[1], captured.version);
  assert.equal(match[1], CLAUDE_CODE_CLIENT_VERSION);
});

test("the default profile meets the reported Opus 5.5 minimum client version", () => {
  const [major, minor, patch] = CLAUDE_CODE_CLIENT_VERSION.split(".").map(Number);
  assert.ok(major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 280))));
});

test("the billing fallback is derived from the captured algorithm, not the build git SHA", () => {
  const emptyUserSuffix = createHash("sha256")
    .update(`${captured.fingerprintSalt}000${captured.version}`)
    .digest("hex")
    .slice(0, 3);
  assert.equal(emptyUserSuffix, captured.billingSuffixForEmptyUserMessage);
  assert.equal(CLAUDE_CODE_CLIENT_BUILD_REVISION, emptyUserSuffix);
  assert.equal(computeFingerprint("", captured.version), emptyUserSuffix);
});

test("message-dependent billing fingerprints keep matching the captured algorithm", () => {
  for (const text of ["Reply with OK.", "A longer first user message to exercise all positions."]) {
    const sampled = [4, 7, 20].map((index) => text[index] || "0").join("");
    const expected = createHash("sha256")
      .update(`${captured.fingerprintSalt}${sampled}${captured.version}`)
      .digest("hex")
      .slice(0, 3);
    assert.equal(computeFingerprint(text, CLAUDE_CODE_CLIENT_VERSION), expected);
  }
});
