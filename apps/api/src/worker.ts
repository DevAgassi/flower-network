import { startTracing } from './observability/tracing.js';

// Worker entry point. Tracing starts first; the app is imported only after
// that, so the instrumentations can patch Nest and pg as they load.
startTracing('flower-worker');
await import('./processes/worker.js');
