import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { HealthResponse } from '@flower/shared';

/** Default API location for local development; override with API_URL. */
const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Runs on the server only, so the API URL never reaches the browser bundle.
 * Returns null when the API is unreachable.
 */
const getApiHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HealthResponse | null> => {
    const apiUrl = process.env.API_URL ?? DEFAULT_API_URL;
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) return null;
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
          <span className="font-semibold text-green-700">
            {health.status} ({health.service}, {health.timestamp})
          </span>
        ) : (
          <span className="font-semibold text-red-700">unreachable</span>
        )}
      </p>
    </main>
  );
}
