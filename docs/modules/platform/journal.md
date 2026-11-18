---
title: Platform journal
module: platform
kind: journal
audience: [developer]
---

# Platform journal

Problems we hit, why they happened and how we solved them. Newest first. Entries are not rewritten when the code changes later.

### Tests could not find `tslib` after adding and removing packages

- **When:** 2026-11-18 · PLT-06 (#28)
- **Symptom:** every Nest test failed with `Cannot find package 'tslib' imported from …/@nestjs/common/…`; `pnpm install` said "Already up to date".
- **Cause:** after several `pnpm add` / `pnpm remove` runs the link `@nestjs/common → tslib@2.9.1` pointed to a store folder that no longer existed; the lockfile was correct, so a normal install saw nothing to do.
- **Fix:** `pnpm install --force` relinked every package.
- **Lesson:** "Cannot find package X" for a package that is in `pnpm-lock.yaml` means broken links, not a missing dependency — run `pnpm install --force` before changing anything.

### `nestjs-zod` does not support NestJS 12

- **When:** 2026-11-18 · PLT-06 (#28)
- **Symptom:** the usual way to use zod DTOs in Nest, `nestjs-zod` 5.6, declares `@nestjs/common ^10 || ^11` and `@nestjs/swagger` up to 11.
- **Cause:** NestJS 12 added the same capability itself: Standard Schema validation (`@Body({ schema })`, `StandardSchemaValidationPipe`) and Standard Schema → OpenAPI in `@nestjs/swagger` 12.
- **Fix:** zod schemas are used through the built-in Standard Schema support; no extra package ([API contract](api-contract.md)).
- **Lesson:** before adding an adapter library after a major framework upgrade, check whether the framework now does it natively.

### Two install-time warnings from the contract tooling

- **When:** 2026-11-18 · PLT-06 (#28)
- **Symptom:** `pnpm add @nestjs/swagger` failed with "Ignored build scripts: @scarf/scarf"; `openapi-typescript` reported an unmet peer `typescript ^5.x`.
- **Cause:** `@scarf/scarf` (pulled in by `swagger-ui-dist`) is a download-analytics install script; `openapi-typescript` 7.13 has not widened its peer range to TypeScript 6.
- **Fix:** `'@scarf/scarf': false` in `allowBuilds`; `peerDependencyRules.allowedVersions` allows TypeScript 6 for `openapi-typescript` after checking that it generates identical output with 6.0.2 ([pnpm-workspace.yaml](../../../pnpm-workspace.yaml)).
- **Lesson:** decide on every blocked install script explicitly; widen a peer range only after verifying the tool works, and note when to remove the rule.

### No NestJS spans in traces

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** traces had `http`, `express` and `pg` spans, but nothing from Nest.
- **Cause:** `@opentelemetry/instrumentation-nestjs-core` 0.72.1 declares `supportedVersions: ">=4.0.0 <12"`; it silently skips `@nestjs/core` 12.
- **Fix:** the instrumentation is not installed; the express route span (`request handler - /health`) names the route.
- **Lesson:** when an instrumentation produces nothing, check its `supportedVersions` first. Follow-up: PLT-13 ([#98](https://github.com/DevAgassi/flower-network/issues/98)), blocked until [opentelemetry-js-contrib#3859](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3859) is released.

### Express was not traced without the ESM loader hook

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** with the instrumentations registered but no ESM hook, traces had only `http` and `pg` spans.
- **Cause:** OpenTelemetry patches CommonJS `require()` by default; Nest 12 is ESM and imports express with `import`, which only a loader hook can intercept. A hook `include` list of package names also misses a package's internal files.
- **Fix:** [`startTracing()`](../../../apps/api/src/observability/tracing.ts) registers import-in-the-middle's synchronous hook (`module.registerHooks`) with a URL regex for the instrumented packages; it runs before the app is imported dynamically. `import-in-the-middle` is a direct dependency at the same version the instrumentations use — two copies make patching fail silently.
- **Lesson:** in an ESM app, tracing needs a loader hook registered before the app loads; verify spans in Jaeger, not only that the SDK starts.

### Grafana could not read traces from Jaeger 2.23

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** the provisioned Jaeger data source in Grafana 13.2 failed its health check with `404 Not Found`.
- **Cause:** Jaeger 2.23 serves its query API under `/api/v3/…`; Grafana's Jaeger plugin still calls the old `/api/services`.
- **Fix:** no Jaeger data source in Grafana; traces are viewed in the Jaeger UI (:16686). A provisioned data source cannot be deleted through the API — it needs `deleteDatasources` in a provisioning file.
- **Lesson:** check that the two ends of an integration speak the same API version before provisioning it.

### A metric was registered twice at startup

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** the API exited with `A metric with the name http_request_duration_seconds has already been registered`.
- **Cause:** the histogram was created in the constructor of `HttpMetricsMiddleware`, which was also listed as a provider; Nest creates a separate instance for `consumer.apply()`.
- **Fix:** the histogram lives in the `HttpMetrics` provider; the middleware only uses it.
- **Lesson:** create metrics in singleton providers, never in middleware, guards or other classes Nest may instantiate more than once.

### Deprecated observability packages

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** the usual choices were deprecated or heavy: `prom-client` ("replaced by @prometheus-io/client"), `@opentelemetry/sdk-trace-node` ("use @opentelemetry/sdk-trace"); `@opentelemetry/sdk-node` pulled gRPC exporters and a blocked `protobufjs` install script.
- **Cause:** the Prometheus client moved to the Prometheus organisation; OpenTelemetry JS 3 merged its trace SDK packages.
- **Fix:** `@prometheus-io/client`, `@opentelemetry/sdk-trace` 3 with the OTLP/HTTP exporter and only the instrumentations we use.
- **Lesson:** check `npm view <pkg> deprecated` and the dependency tree before adopting a package from memory.

### The outbox inbox table grows forever

- **When:** 2026-11-15 · PLT-04 (#26)
- **Symptom:** found while reading the package: every processed message leaves an inbox row, and nothing ever deletes it.
- **Cause:** `@nestjs/outbox` offers `inbox.prune(age)` but does not schedule it; cleanup is left to the application.
- **Fix:** [`OutboxRetention`](../../../apps/api/src/outbox/outbox-retention.service.ts) prunes records older than 30 days daily at 03:00 with `@nestjs/schedule`; failures are logged, not thrown.
- **Lesson:** for every table a library writes to, check who deletes old rows.

### `db.transaction(tx => outbox.add(…))` does not type-check

- **When:** 2026-11-15 · PLT-04 (#26)
- **Symptom:** TypeScript error on the transaction callback when it returns `outbox.add(…)` directly.
- **Cause:** `add()` returns `Awaitable<void>` (a value or a promise), while Drizzle's callback must return a `Promise`.
- **Fix:** write the callback as `async (tx) => { await outbox.add(tx, …); }`.
- **Lesson:** always use an `async` block callback for `db.transaction()`.

### The web app checked its environment only on the first request

- **When:** 2026-11-15 · PLT-11 (#91)
- **Symptom:** the built web server started without `API_URL` and failed only when the first page was opened.
- **Cause:** `getServerEnv()` was called lazily from a server function; nothing ran at startup.
- **Fix:** a Nitro server plugin, [`validate-env.ts`](../../../apps/web/src/server-plugins/validate-env.ts), registered in `vite.config.ts`, validates at startup and exits with code 1.
- **Lesson:** fail-fast validation must run in the startup path, not in the first code that happens to need the value.

### An invalid environment produced a stack trace instead of a message

- **When:** 2026-11-15 · PLT-11 (#91)
- **Symptom:** the readable "Invalid environment configuration" list was buried in a Nest error log with a long stack trace.
- **Cause:** by default Nest logs startup errors itself (level `error`) and aborts the process.
- **Fix:** `abortOnError: false` and a startup logger without `error`; [`runOrExit()`](../../../apps/api/src/bootstrap.ts) prints the message once and exits. The full logger is enabled after startup.
- **Lesson:** startup errors are for operators: one readable message, exit code 1.

### Variables set in the shell did not reach the app under Turborepo

- **When:** 2026-11-15 · PLT-11 (#91)
- **Symptom:** `DATABASE_URL=… pnpm start` still failed with "DATABASE_URL: is required in production".
- **Cause:** Turborepo runs tasks in strict environment mode and passes only the variables it is told about.
- **Fix:** every runtime variable is listed in [turbo.json](../../../turbo.json) → `passThroughEnv` for `dev` and `start`.
- **Lesson:** a new environment variable is three edits: schema, `passThroughEnv`, docs ([Configuration](configuration.md#adding-a-variable)).

### `NODE_ENV=production node …` failed on Windows

- **When:** 2026-11-15 · PLT-11 (#91)
- **Symptom:** `pnpm start` on Windows: `'NODE_ENV' is not recognized as an internal or external command`.
- **Cause:** pnpm runs scripts in the system shell (`cmd.exe` on Windows), which has no inline variable syntax.
- **Fix:** `shellEmulator: true` in [pnpm-workspace.yaml](../../../pnpm-workspace.yaml): scripts run in pnpm's cross-platform shell. No `cross-env` dependency needed.
- **Lesson:** test scripts on Windows; prefer the shell emulator over per-script workarounds.

### `AppConfigService` could not be injected into `DatabaseModule`

- **When:** 2026-11-15 · PLT-11 (#91)
- **Symptom:** Nest could not resolve `AppConfigService` in the pool factory of `DatabaseModule`.
- **Cause:** `ConfigModule.forRoot({ isGlobal: true })` makes `ConfigService` global, but our `AppConfigService` provider lived in a non-global module.
- **Fix:** `AppConfigModule` is `@Global()` and exports `AppConfigService`.
- **Lesson:** an alias provider (`useExisting`) is only as visible as the module that declares it.

### Idle PostgreSQL connection crashed the API

- **When:** 2026-11-15 · PLT-03 (#25)
- **Symptom:** restarting the PostgreSQL container killed the running API process.
- **Cause:** when the server drops an idle connection, `pg.Pool` emits `error`; with no listener Node treats it as an unhandled `error` event and exits.
- **Fix:** [`createPool()`](../../../apps/api/src/database/database.module.ts) adds a listener that logs a warning; the pool replaces the connection itself. Covered by `database.module.spec.ts`.
- **Lesson:** every long-lived client (pg, Redis, BullMQ) needs an `error` listener.

### Port 5432 was already taken

- **When:** 2026-11-15 · PLT-01 (#23)
- **Symptom:** the PostgreSQL container could not bind port 5432.
- **Cause:** another local project's PostgreSQL already used it.
- **Fix:** host port 5433 (`POSTGRES_PORT`), pgAdmin on 5051; container ports unchanged.
- **Lesson:** use non-default host ports for local services and make them configurable.

### The MinIO image is no longer available

- **When:** 2026-11-15 · PLT-01 (#23)
- **Symptom:** `minio/minio` could not be pulled from Docker Hub.
- **Cause:** MinIO stopped publishing community images.
- **Fix:** RustFS, an S3-compatible server under Apache 2.0 (ADR-11 in [init.md](../../../init.md)); the bucket is created by an AWS CLI one-off service.
- **Lesson:** depend on the S3 API, not on a specific server; any S3-compatible storage can replace it.
