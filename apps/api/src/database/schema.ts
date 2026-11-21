/**
 * Registry of Drizzle schemas. Every module defines its tables in its own
 * `<module>.schema.ts` and re-exports it here; drizzle-kit reads this file to
 * generate migrations. Modules never query each other's tables; a schema may
 * import another module's table only to declare a foreign key.
 */
export * from '../catalog/catalog.schema.js';
export * from '../identity/identity.schema.js';
export * from '../locations/locations.schema.js';
