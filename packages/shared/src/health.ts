/** Result of a single dependency check. */
export type HealthCheckStatus = 'up' | 'down';

/**
 * Response of the `GET /health` endpoint exposed by every backend app.
 * HTTP 200 when every check is up, 503 otherwise (same body shape).
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  /** Name of the app that answered, e.g. `api`. */
  service: string;
  /** ISO 8601 timestamp of the response. */
  timestamp: string;
  /** Dependency checks by name, e.g. `{ database: 'up' }`. */
  checks: Record<string, HealthCheckStatus>;
}
