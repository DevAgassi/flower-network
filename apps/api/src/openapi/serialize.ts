import type { OpenAPIObject } from '@nestjs/swagger';

/** Stable text form of the document, so regenerating without changes gives no diff. */
export function serializeOpenApi(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
