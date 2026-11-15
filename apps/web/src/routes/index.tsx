import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { HealthResponse } from '@flower/shared';

/** Default API location for local development; override with API_URL. */
const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Runs on the server only, so the API URL never reaches the browser bundle.
 * Returns null when the API is unreachable. A 503 still carries a health body
 * (some dependency is down), so it is returned as is.
 */
const getApiHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HealthResponse | null> => {
    const apiUrl = process.env.API_URL ?? DEFAULT_API_URL;
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok && response.status !== 503) return null;
      return (await response.json()) as HealthResponse;
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
