type DbHealthCheckEnv = Partial<
  Pick<NodeJS.ProcessEnv, "OMNIROUTE_SKIP_DB_HEALTHCHECK" | "OMNIROUTE_FORCE_DB_HEALTHCHECK">
>;

/**
 * Disable both startup and periodic SQLite health checks when explicitly requested.
 * The force flag remains the operator escape hatch for one-off repair runs.
 */
export function isDbHealthCheckDisabled(env: DbHealthCheckEnv = process.env): boolean {
  if (env.OMNIROUTE_FORCE_DB_HEALTHCHECK === "1") return false;
  return env.OMNIROUTE_SKIP_DB_HEALTHCHECK === "1";
}
