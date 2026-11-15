/**
 * Response of the `GET /health` endpoint exposed by every backend app.
 */
export interface HealthResponse {
  status: 'ok';
  /** Name of the app that answered, e.g. `api`. */
  service: string;
  /** ISO 8601 timestamp of the response. */
  timestamp: string;
}
