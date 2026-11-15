import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { pinoHttp, type Options } from 'pino-http';
import { assignRequestId, loggerParams, traceFields } from './logging.js';

function fakeExchange(headers: Record<string, string> = {}) {
  const res = { setHeader: vi.fn() };
  return {
    req: { headers } as unknown as IncomingMessage,
    res: res as unknown as ServerResponse,
    setHeader: res.setHeader,
  };
}

describe('assignRequestId', () => {
  it('reuses a valid incoming x-request-id and returns it', () => {
    const { req, res, setHeader } = fakeExchange({ 'x-request-id': 'abc-123' });

    expect(assignRequestId(req, res)).toBe('abc-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
  });

  it('generates an id when the header is missing or unsafe', () => {
    const missing = fakeExchange();
    const unsafe = fakeExchange({ 'x-request-id': 'bad id\n{"level":60}' });

    const generated = assignRequestId(missing.req, missing.res);
    const replaced = assignRequestId(unsafe.req, unsafe.res);

    expect(generated).toMatch(/^[\da-f-]{36}$/);
    expect(replaced).toMatch(/^[\da-f-]{36}$/);
    expect(unsafe.setHeader).toHaveBeenCalledWith('x-request-id', replaced);
  });
});

describe('traceFields', () => {
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  afterAll(() => {
    context.disable();
  });

  it('is empty outside a span', () => {
    expect(traceFields()).toEqual({});
  });

  it('returns the ids of the active span', () => {
    const span = new TracerProvider().getTracer('test').startSpan('work');
    const { traceId, spanId } = span.spanContext();

    const fields = context.with(trace.setSpan(context.active(), span), () =>
      traceFields(),
    );
    span.end();

    expect(fields).toEqual({ trace_id: traceId, span_id: spanId });
  });
});

describe('loggerParams', () => {
  it('pretty-prints in development and writes JSON otherwise', () => {
    const dev = loggerParams({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
    const prod = loggerParams({ NODE_ENV: 'production', LOG_LEVEL: 'warn' });

    expect(dev.pinoHttp).toMatchObject({
      transport: { target: 'pino-pretty' },
    });
    expect(prod.pinoHttp).toMatchObject({
      level: 'warn',
      transport: undefined,
    });
  });
});

describe('HTTP request logging', () => {
  const lines: Record<string, unknown>[] = [];
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const options = loggerParams({ NODE_ENV: 'production', LOG_LEVEL: 'info' })
      .pinoHttp as Options;
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        done();
      },
    });
    const logger = pinoHttp(options, stream);
    server = createServer((req, res) => {
      logger(req, res);
      req.log.info('inside the request');
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    lines.length = 0;
  });

  it('logs request_id, method, url, status and duration as JSON', async () => {
    const response = await fetch(`${baseUrl}/orders?page=2`, {
      headers: { 'x-request-id': 'req-1' },
    });

    expect(response.headers.get('x-request-id')).toBe('req-1');
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'info',
        request_id: 'req-1',
        msg: 'inside the request',
      }),
      expect.objectContaining({
        level: 'info',
        request_id: 'req-1',
        req: { method: 'GET', url: '/orders?page=2' },
        res: { statusCode: 200 },
        responseTime: expect.any(Number) as number,
        msg: 'request completed',
      }),
    ]);
    expect(Number.isNaN(Date.parse(lines[0].time as string))).toBe(false);
  });

  it('never writes credentials from headers', async () => {
    await fetch(`${baseUrl}/orders`, {
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'sid=secret-cookie',
      },
    });

    const output = JSON.stringify(lines);
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('secret-cookie');
  });

  it('does not log health checks and metric scrapes', async () => {
    await fetch(`${baseUrl}/health`);
    await fetch(`${baseUrl}/metrics`);

    expect(lines.filter((l) => l.msg === 'request completed')).toEqual([]);
  });
});
