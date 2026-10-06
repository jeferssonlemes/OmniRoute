import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import type { SqliteAdapter } from "../../../src/lib/db/adapters/types.ts";
import { runMigrations } from "../../../src/lib/db/migrationRunner.ts";

test("upgrade from the deployed migration 171 preserves Claude accounts, keys and model settings", () => {
  const db = new Database(":memory:");
  const migrationsDir = path.join(process.cwd(), "src/lib/db/migrations");
  const originalReaddirSync = fs.readdirSync;

  try {
    // Build a synthetic legacy schema; no production database or credentials are used.
    db.exec(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/db/omniroute-pre-final-v3.8.51-schema.sql"),
        "utf8"
      )
    );
    fs.readdirSync = ((target: fs.PathLike, options?: unknown) => {
      const result = Reflect.apply(originalReaddirSync, fs, [target, options]);
      if (String(target) !== migrationsDir) return result;
      return (result as string[]).filter((name) => Number(name.split("_")[0]) <= 171);
    }) as typeof fs.readdirSync;
    try {
      runMigrations(db as unknown as SqliteAdapter, { isNewDb: true });
    } finally {
      fs.readdirSync = originalReaddirSync;
    }

    const highestVersion = () =>
      db
        .prepare("SELECT MAX(CAST(version AS INTEGER)) AS version FROM _omniroute_migrations")
        .get() as { version: number };
    assert.equal(highestVersion().version, 171);

    db.prepare(
      `INSERT INTO provider_connections
       (id, provider, auth_type, name, access_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "existing-claude-account",
      "claude",
      "oauth",
      "Synthetic account",
      "synthetic-test-token",
      "2026-09-02",
      "2026-09-02"
    );
    db.prepare("INSERT INTO api_keys (id, name, key, created_at) VALUES (?, ?, ?, ?)").run(
      "existing-endpoint-key",
      "Synthetic key",
      "synthetic-endpoint-key",
      "2026-09-02"
    );
    const customModels = JSON.stringify([{ id: "claude-opus-5.5", provider: "claude" }]);
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
      "settings",
      "customModels",
      customModels
    );

    assert.equal(runMigrations(db as unknown as SqliteAdapter), 25);
    assert.equal(highestVersion().version, 196);
    assert.deepEqual(
      db
        .prepare("SELECT provider, auth_type, access_token FROM provider_connections WHERE id = ?")
        .get("existing-claude-account"),
      { provider: "claude", auth_type: "oauth", access_token: "synthetic-test-token" }
    );
    assert.deepEqual(
      db.prepare("SELECT key FROM api_keys WHERE id = ?").get("existing-endpoint-key"),
      { key: "synthetic-endpoint-key" }
    );
    assert.deepEqual(
      db
        .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
        .get("settings", "customModels"),
      { value: customModels }
    );
    assert.equal(runMigrations(db as unknown as SqliteAdapter), 0, "upgrade must be idempotent");
    assert.deepEqual(db.pragma("quick_check"), [{ quick_check: "ok" }]);
  } finally {
    fs.readdirSync = originalReaddirSync;
    db.close();
  }
});
