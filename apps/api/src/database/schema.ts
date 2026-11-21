/**
 * Registry of Drizzle schemas. Every module defines its tables in its own
 * `<module>.schema.ts` and re-exports it here; drizzle-kit reads this file to
 * generate migrations. Modules must not import each other's tables.
 */
export * from '../identity/identity.schema.js';
