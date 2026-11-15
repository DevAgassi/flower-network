// Loaded before any other application module (see main.ts / worker.ts): the
// instrumentations can only patch libraries that are imported after them.
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  register as registerEsmHooks,
  supportsSyncHooks,
} from 'import-in-the-middle/register-hooks.mjs';
import { loadEnv } from '../config/env-files.js';
import type { Env } from '../config/env.schema.js';

/**
 * Modules that go through the ESM hook: the ones the instrumentations below
 * patch. Without the hook express is not traced, because Nest 12 (ESM)
 * imports it. A regular expression is matched against the file URL, so it
 * also covers a package's internal files.
 *
 * No NestJS instrumentation: @opentelemetry/instrumentation-nestjs-core
 * supports @nestjs/core < 12 only. Express spans already name the route.
 * Added back in PLT-13 (#98) once a release supports Nest 12.
 */
const INSTRUMENTED_MODULES: Array<string | RegExp> = [
  'http',
  'https',
  'node:http',
  'node:https',
  /\/node_modules\/(express|pg)\//,
];

/** Requests that never get a trace: Prometheus scrapes every 15 s. */
const UNTRACED_PATHS = new Set(['/metrics']);

let provider: TracerProvider | undefined;

/**
 * Starts OpenTelemetry tracing for this process. Does nothing when no OTLP
 * endpoint is configured (default outside development) or when the
 * environment is invalid — the entry point then reports the problem.
 */
export function startTracing(serviceName: string): void {
  let env: Env;
  try {
    env = loadEnv();
  } catch {
    return;
  }
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || provider) return;

  // NestJS 12 is ESM: imports are patched through import-in-the-middle's
  // synchronous loader (module.registerHooks). It must be the same copy the
  // instrumentations use, or patching silently does nothing.
  if (supportsSyncHooks()) {
    registerEsmHooks({ include: INSTRUMENTED_MODULES });
  } else {
    console.warn(
      `Tracing is off: Node.js ${process.version} cannot run synchronous ESM loader hooks (needs 24.11.1+).`,
    );
    return;
  }

  provider = new TracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      'deployment.environment.name': env.NODE_ENV,
    }),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      }),
    ],
  });
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          UNTRACED_PATHS.has(req.url?.split('?')[0] ?? ''),
      }),
      new ExpressInstrumentation(),
      // requireParentSpan: queries outside a request (the outbox relay polls
      // every second) would otherwise each become a separate trace.
      new PgInstrumentation({ requireParentSpan: true }),
    ],
  });
}

/** Sends buffered spans and stops tracing; called on application shutdown. */
export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown();
  provider = undefined;
}
