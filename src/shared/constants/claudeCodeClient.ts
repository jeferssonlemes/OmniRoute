/**
 * Wire-version data captured from the official Claude Code 2.1.291 distribution.
 * Capture provenance lives in tests/fixtures/claude-code/2.1.291-profile.json.
 *
 * Keep this leaf dependency-free so server executors, compatibility bridges,
 * and client-facing identity presets can share one source of truth.
 *
 * `CLAUDE_CODE_CLIENT_VERSION` is the captured pin. Runtime callers that
 * advertise the version on the wire must go through getClaudeCodeClientVersion()
 * so operators can bump past Anthropic's model gate without a rebuild (#12417).
 */
export const CLAUDE_CODE_CLIENT_VERSION = "2.1.291";
/** Empty-user-message fallback from the CLI's message-derived billing hash. */
export const CLAUDE_CODE_CLIENT_BUILD_REVISION = "926";
export const CLAUDE_CODE_CLIENT_BILLING_VERSION = `${CLAUDE_CODE_CLIENT_VERSION}.${CLAUDE_CODE_CLIENT_BUILD_REVISION}`;
export const CLAUDE_CODE_SDK_PACKAGE_VERSION = "0.128.0";
export const CLAUDE_CODE_RUNTIME_VERSION = "v26.3.0";

export type ClaudeCodeEntrypoint = "cli" | "sdk-cli";

const CLAUDE_VERSION_OVERRIDE_ENV = "CLAUDE_CODE_CLIENT_VERSION";
const CLAUDE_BUILD_REVISION_OVERRIDE_ENV = "CLAUDE_CODE_CLIENT_BUILD_REVISION";
const SAFE_HEADER_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

function getSafeEnvValue(name: string, pattern: RegExp): string | null {
  const raw = typeof process === "undefined" ? undefined : process.env?.[name];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (!normalized || !pattern.test(normalized)) {
    return null;
  }
  return normalized;
}

export function getClaudeCodeClientVersion(): string {
  return (
    getSafeEnvValue(CLAUDE_VERSION_OVERRIDE_ENV, SAFE_HEADER_TOKEN_PATTERN) ||
    CLAUDE_CODE_CLIENT_VERSION
  );
}

/**
 * Fallback 3-character suffix on `cc_version=`. This is a message-derived
 * fingerprint, not the CLI build's git revision. Request-aware paths compute
 * their own fingerprint; transports without a message use the empty-message
 * value. Keep the override for operators with a separately captured profile.
 */
export function getClaudeCodeClientBuildRevision(): string {
  return (
    getSafeEnvValue(CLAUDE_BUILD_REVISION_OVERRIDE_ENV, SAFE_HEADER_TOKEN_PATTERN) ||
    CLAUDE_CODE_CLIENT_BUILD_REVISION
  );
}

export function getClaudeCodeClientBillingVersion(): string {
  return `${getClaudeCodeClientVersion()}.${getClaudeCodeClientBuildRevision()}`;
}

export function getClaudeCodeUserAgent(entrypoint: ClaudeCodeEntrypoint): string {
  return `claude-cli/${getClaudeCodeClientVersion()} (external, ${entrypoint})`;
}
