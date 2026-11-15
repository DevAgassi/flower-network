import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { Env } from '../config/env.schema.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Request ids accepted from a client or proxy; anything else is replaced, so logs cannot be forged. */
const VALID_REQUEST_ID = /^[\w.-]{1,128}$/;

/** Requests that are not logged: probes and scrapes arrive every few seconds. */
const QUIET_PATHS = new Set(['/health', '/metrics']);

/** Header values that must never reach the logs. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

/** Reuses a valid incoming x-request-id or generates one, and returns it to the client. */
export function assignRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** trace_id / span_id of the active span, so a log line links to its trace. */
export function traceFields(): { trace_id?: string; span_id?: string } {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

/**
 * nestjs-pino settings: one JSON object per line on stdout in production
 * (collected by the platform), colored single lines in development.
 */
export function loggerParams(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      // "level":"info" and an ISO time instead of pino's numbers: readable by
      // people and by any log collector.
      formatters: { level: (label) => ({ level: label }) },
      timestamp: stdTimeFunctions.isoTime,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      genReqId: assignRequestId,
      // Every line logged during a request carries request_id only, not the
      // whole request; the "request completed" line adds method, url, status.
      quietReqLogger: true,
      customAttributeKeys: { reqId: 'request_id' },
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      mixin: traceFields,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      autoLogging: {
        ignore: (req) => QUIET_PATHS.has(req.url?.split('?')[0] ?? ''),
      },
    },
  };
}
