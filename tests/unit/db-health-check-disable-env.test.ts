import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { isDbHealthCheckDisabled } from "../../src/lib/db/healthCheckPolicy.ts";

test("OMNIROUTE_SKIP_DB_HEALTHCHECK=1 disables database health checks", () => {
  assert.equal(
    isDbHealthCheckDisabled({
      OMNIROUTE_SKIP_DB_HEALTHCHECK: "1",
    }),
    true
  );
});

test("OMNIROUTE_FORCE_DB_HEALTHCHECK=1 overrides the disable flag", () => {
  assert.equal(
    isDbHealthCheckDisabled({
      OMNIROUTE_SKIP_DB_HEALTHCHECK: "1",
      OMNIROUTE_FORCE_DB_HEALTHCHECK: "1",
    }),
    false
  );
});

test("database health checks remain enabled by default", () => {
  assert.equal(isDbHealthCheckDisabled({}), false);
  assert.equal(
    isDbHealthCheckDisabled({
      OMNIROUTE_SKIP_DB_HEALTHCHECK: "0",
    }),
    false
  );
});

test("the disable policy gates both startup and periodic database health checks", () => {
  const coreSource = fs.readFileSync(path.join(process.cwd(), "src/lib/db/core.ts"), "utf8");
  const startupStart = coreSource.indexOf("function shouldRunStartupDbHealthCheck");
  const schedulerStart = coreSource.indexOf("function startDbHealthCheckScheduler");

  assert.notEqual(startupStart, -1);
  assert.notEqual(schedulerStart, -1);
  assert.match(coreSource.slice(startupStart, startupStart + 350), /isDbHealthCheckDisabled\(\)/);
  assert.match(
    coreSource.slice(schedulerStart, schedulerStart + 350),
    /isDbHealthCheckDisabled\(\)/
  );
});
