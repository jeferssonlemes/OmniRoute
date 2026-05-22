/**
 * ClickHouse external logger — best-effort, non-blocking
 *
 * Attached to saveCallLog() so every request persisted in OmniRoute SQLite
 * is also streamed to ClickHouse for analytics / audit.
 *
 * Environment:
 *   CLICKHOUSE_URL      — default http://clickhouse.omniroute.svc.cluster.local:8123
 *   CLICKHOUSE_USER     — default "default"
 *   CLICKHOUSE_PASSWORD — default "" (from sealed secret)
 *   CLICKHOUSE_LOG_FULL_BODY — "true" to log raw request/response payloads
 *   CLICKHOUSE_BATCH_SIZE    — rows per flush (default 100)
 *   CLICKHOUSE_FLUSH_MS      — max ms before flush (default 5000)
 */

const CH_URL = (process.env.CLICKHOUSE_URL || "http://clickhouse.omniroute.svc.cluster.local:8123").replace(/\/$/, "");
const CH_USER = process.env.CLICKHOUSE_USER || "default";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || "";
const DB = "default";
const TABLE = "omniroute_requests";

const LOG_FULL_BODY = process.env.CLICKHOUSE_LOG_FULL_BODY === "true";
const BATCH_SIZE = Math.min(Math.max(Number(process.env.CLICKHOUSE_BATCH_SIZE || "100"), 10), 1000);
const FLUSH_MS = Math.min(Math.max(Number(process.env.CLICKHOUSE_FLUSH_MS || "5000"), 1000), 30000);
const MAX_BUFFER = BATCH_SIZE * 5; // hard ceiling to prevent unbounded growth

interface ChRow {
  request_id: string;
  timestamp: string;
  api_key_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  status: number;
  latency_ms: number;
  messages: string;
  response: string;
  error: string;
}

// IMPORTANT: store state on globalThis so all Webpack-split copies of this
// module share the same buffer/initialized flag. Next.js dynamic imports
// can produce per-consumer chunk copies, and without a shared singleton
// the minifier strips the emit path (it sees _initialized never becoming
// true within its own chunk and treats the function body as unreachable).
interface ChState {
  buffer: ChRow[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  initialized: boolean;
  initError: string | null;
  consecutiveFailures: number;
}

const STATE_KEY = "__omniClickHouseLoggerState";
const _state: ChState = ((globalThis as any)[STATE_KEY] ??= {
  buffer: [],
  flushTimer: null,
  initialized: false,
  initError: null,
  consecutiveFailures: 0,
});

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "text/plain; charset=UTF-8",
  };
  if (CH_PASS) {
    h["Authorization"] = "Basic " + Buffer.from(`${CH_USER}:${CH_PASS}`).toString("base64");
  }
  return h;
}

async function chExec(query: string): Promise<void> {
  const res = await fetch(`${CH_URL}/?database=${encodeURIComponent(DB)}`, {
    method: "POST",
    headers: authHeaders(),
    body: query,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`CH ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function ensureTable(): Promise<void> {
  const ddl = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
    request_id String,
    timestamp DateTime64(3) CODEC(Delta, LZ4),
    api_key_id LowCardinality(String),
    model LowCardinality(String),
    provider LowCardinality(String),
    input_tokens UInt32,
    output_tokens UInt32,
    cost Float64,
    status UInt16,
    latency_ms UInt32,
    messages String CODEC(ZSTD(3)),
    response String CODEC(ZSTD(3)),
    error String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (api_key_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY
SETTINGS index_granularity = 8192
`.trim();
  await chExec(ddl);
}

async function flushBuffer(): Promise<void> {
  if (_state.buffer.length === 0) return;
  const batch = _state.buffer.splice(0, _state.buffer.length);

  const body = batch.map((r) => JSON.stringify(r)).join("\n");
  const query = `INSERT INTO ${TABLE} FORMAT JSONEachRow`;

  try {
    const res = await fetch(
      `${CH_URL}/?database=${encodeURIComponent(DB)}&query=${encodeURIComponent(query)}`,
      {
        method: "POST",
        headers: authHeaders(),
        body,
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`CH insert ${res.status}: ${text.slice(0, 200)}`);
    }
    _state.consecutiveFailures = 0;
    if (process.env.APP_LOG_LEVEL === "debug") {
      // eslint-disable-next-line no-console
      console.log(`[ClickHouse] flushed ${batch.length} rows`);
    }
  } catch (err: any) {
    _state.consecutiveFailures++;
    // eslint-disable-next-line no-console
    console.error(`[ClickHouse] flush failed (${_state.consecutiveFailures}x): ${err.message}`);
    // Re-queue, but enforce max buffer. If we keep failing, drop oldest.
    const total = _state.buffer.length + batch.length;
    if (total > MAX_BUFFER) {
      const drop = total - MAX_BUFFER;
      // eslint-disable-next-line no-console
      console.error(`[ClickHouse] buffer overflow — dropping ${drop} oldest rows`);
      _state.buffer = [...batch, ..._state.buffer].slice(drop);
    } else {
      _state.buffer.unshift(...batch);
    }
  }
}

function scheduleFlush() {
  if (_state.flushTimer) return;
  _state.flushTimer = setTimeout(() => {
    _state.flushTimer = null;
    flushBuffer().catch(() => {});
  }, FLUSH_MS);
}

function safeJson(value: unknown, fallback = "<serialize-failed>"): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/** Call once at server startup. Idempotent. */
export async function initClickHouseLogger(): Promise<void> {
  if (_state.initialized || _state.initError) return;
  try {
    await ensureTable();
    _state.initialized = true;
    // eslint-disable-next-line no-console
    console.log(`[ClickHouse] logger ready — ${TABLE} (ttl=7d, batch=${BATCH_SIZE}, maxBuf=${MAX_BUFFER})`);
  } catch (err: any) {
    _state.initError = err.message;
    // eslint-disable-next-line no-console
    console.error(`[ClickHouse] init failed: ${err.message}`);
  }
}

/** Emits a call-log row to ClickHouse (best-effort, never throws). */
export function emitClickHouseLog(entry: Record<string, any>): void {
  if (!_state.initialized) return;

  const tokens = entry.tokens || {};
  const duration = typeof entry.duration === "number" ? entry.duration : 0;
  const status = typeof entry.status === "number" ? entry.status : 0;

  const messages = LOG_FULL_BODY ? safeJson(entry.requestBody) : "";
  const response = LOG_FULL_BODY ? safeJson(entry.responseBody) : "";
  const error = entry.error ? safeJson(entry.error) : "";

  const row: ChRow = {
    request_id: String(entry.id || entry.requestId || "unknown"),
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
    api_key_id: String(entry.apiKeyId || "unknown"),
    model: String(entry.model || entry.requestedModel || "unknown"),
    provider: String(entry.provider || "unknown"),
    input_tokens: Number(tokens.prompt_tokens ?? tokens.input_tokens ?? 0),
    output_tokens: Number(tokens.completion_tokens ?? tokens.output_tokens ?? 0),
    cost: Number(entry.cost ?? 0),
    status,
    latency_ms: duration,
    messages,
    response,
    error,
  };

  _state.buffer.push(row);
  if (_state.buffer.length >= BATCH_SIZE) {
    flushBuffer().catch(() => {});
  } else {
    scheduleFlush();
  }
}
