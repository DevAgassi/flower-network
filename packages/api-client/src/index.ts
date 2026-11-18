import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };

/** Schemas of the API by name, e.g. `ApiSchemas['HealthResponse']`. */
export type ApiSchemas = components['schemas'];

/**
 * Typed client for the API: paths, methods, parameters, bodies and responses
 * come from openapi.json.
 *
 * ```ts
 * const api = createApiClient('http://localhost:3001');
 * const { data, error, response } = await api.GET('/health');
 * ```
 *
 * `data` is the typed body of a 2xx response, `error` the typed body of any
 * other documented status; network failures throw.
 */
export function createApiClient(
  baseUrl: string,
  options: Omit<ClientOptions, 'baseUrl'> = {},
) {
  return createClient<paths>({ ...options, baseUrl });
}

export type ApiClient = ReturnType<typeof createApiClient>;
