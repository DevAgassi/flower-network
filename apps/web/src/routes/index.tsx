import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { type ApiSchemas, createApiClient } from '@flower/api-client';
import { getServerEnv } from '#/env.server';

type HealthResponse = ApiSchemas['HealthResponse'];

/**
 * Runs on the server only, so the API URL never reaches the browser bundle.
 * Returns null when the API is unreachable. A 503 still carries a health body
 * (some dependency is down): the typed client returns it as `error`.
 */
const getApiHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HealthResponse | null> => {
    try {
      const api = createApiClient(getServerEnv().API_URL);
      const { data, error } = await api.GET('/health');
      return data ?? error ?? null;
    } catch {
      return null;
    }
  },
);

export const Route = createFileRoute('/')({
  loader: () => getApiHealth(),
  component: Home,
});

function Home() {
  const health = Route.useLoaderData();

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">Flower Network</h1>
      <p className="mt-4 text-lg">
        API status:{' '}
        {health ? (
          <span
            className={`font-semibold ${health.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}
          >
            {health.status} ({health.service}, {health.timestamp})
          </span>
        ) : (
          <span className="font-semibold text-red-700">unreachable</span>
        )}
      </p>
      {health && (
        <ul className="mt-2 text-base">
          {Object.entries(health.checks).map(([name, state]) => (
            <li key={name}>
              {name}:{' '}
              <span
                className={state === 'up' ? 'text-green-700' : 'text-red-700'}
              >
                {state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
