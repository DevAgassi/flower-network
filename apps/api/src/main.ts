import { startTracing } from './observability/tracing.js';

// HTTP API entry point. Tracing starts first; the app is imported only after
// that, so the instrumentations can patch Nest, express and pg as they load.
startTracing('flower-api');
await import('./processes/api.js');
