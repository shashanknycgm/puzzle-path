/**
 * Honeycomb telemetry — thin wrapper around the Honeycomb Events API.
 * No SDK required; uses a plain fetch so it works in React Native.
 *
 * All calls are fire-and-forget: telemetry is never allowed to throw or
 * slow down the app.
 *
 * Dataset: "puzzle-path"
 * Docs: https://docs.honeycomb.io/send-data/rest-api/
 */

const API_KEY = process.env.EXPO_PUBLIC_HONEYCOMB_API_KEY ?? '';
const DATASET = 'puzzle-path';
// dogfood instance — standard accounts use https://api.honeycomb.io
const ENDPOINT = `https://api-dogfood.honeycomb.io/1/events/${DATASET}`;

type Fields = Record<string, string | number | boolean | null | undefined>;

/** Send a single event to Honeycomb. Fire-and-forget — never throws. */
export function track(name: string, fields?: Fields): void {
  if (!API_KEY) {
    console.warn('[telemetry] EXPO_PUBLIC_HONEYCOMB_API_KEY is not set — event dropped:', name);
    return;
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Honeycomb-Team': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  })
    .then(res => {
      if (!res.ok) {
        res.text().then(body => console.warn(`[telemetry] Honeycomb rejected event "${name}": ${res.status} ${body}`));
      }
    })
    .catch(err => console.warn('[telemetry] Honeycomb fetch failed:', err));
}

/**
 * Start a span. Call .finish(fields?) on success or .error(err, fields?) on failure.
 * duration_ms is automatically recorded.
 *
 * Usage:
 *   const span = startSpan('engine.enrich', { depth: 5 });
 *   try { ... span.finish({ best_move: 'e2e4' }); }
 *   catch (e) { span.error(e); throw e; }
 */
export function startSpan(name: string, baseFields?: Fields) {
  const t0 = Date.now();

  return {
    finish(extraFields?: Fields) {
      track(name, { ...baseFields, ...extraFields, duration_ms: Date.now() - t0, error: false });
    },
    error(err: unknown, extraFields?: Fields) {
      track(name, {
        ...baseFields,
        ...extraFields,
        duration_ms: Date.now() - t0,
        error: true,
        error_message: err instanceof Error ? err.message : String(err),
      });
    },
  };
}
