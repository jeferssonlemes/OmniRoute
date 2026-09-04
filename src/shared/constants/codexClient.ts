// Kept in lockstep with the codex CLI actually installed in the OmniRoute image
// (Dockerfile runner-cli pins `@openai/codex`; runtime is 0.153.3 as of
// 2026-09-04). When the image's Codex package is bumped, refresh this so the
// fingerprint OpenAI sees from the OAuth/Responses face matches the real client
// version. Overridable per-deployment via the CODEX_CLIENT_VERSION env.
export const DEFAULT_CODEX_CLIENT_VERSION = "0.153.3";
export const CODEX_CLI_RS_ORIGINATOR = "codex_cli_rs";

export function getCodexCliRsHeaders(
  version = DEFAULT_CODEX_CLIENT_VERSION
): Record<string, string> {
  return {
    "User-Agent": `${CODEX_CLI_RS_ORIGINATOR}/${version}`,
    originator: CODEX_CLI_RS_ORIGINATOR,
  };
}
