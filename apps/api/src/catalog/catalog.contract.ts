import { z } from 'zod';
import { pageSchema, paginationQuery } from '../openapi/pagination.contract.js';
import { productStatus } from './catalog.schema.js';

export const productStatusSchema = z.enum(productStatus.enumValues).meta({
  id: 'ProductStatus',
  description: '`draft` is being prepared and not shown to customers',
});

const slug = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase a-z, 0-9 and single hyphens')
  .meta({ example: 'ecuador-rose' });

const sku = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Letters, digits, . _ -'))
  .meta({ example: 'ROSE-ECU-60', description: 'Stored uppercase' });

const metadataSchema = z.record(z.string(), z.unknown());
const metadata = {
  publicMetadata: metadataSchema.meta({
    description: 'Data for the storefront and integrations',
  }),
  privateMetadata: metadataSchema.meta({
    description: 'Internal data, never shown to customers',
  }),
};

export const variantSchema = z
  .object({
    id: z.uuid(),
    sku: z.string(),
    isMaster: z.boolean(),
    position: z.number().int(),
    ...metadata,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Variant' });

export const productSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: productStatusSchema,
    ...metadata,
    variants: z.array(variantSchema).meta({
      description: 'Master first, then by position',
    }),
    sellableVariantIds: z.array(z.uuid()).meta({
      description:
        'What can be sold: the non-master variants, or the master when there are none',
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Product' });

export const productPageSchema = pageSchema(productSchema, 'ProductPage');

export const listProductsQuerySchema = z.object({
  ...paginationQuery,
  status: productStatusSchema.optional(),
  q: z.string().trim().min(1).max(100).optional().meta({
    description: 'Search in product names and SKUs',
  }),
});

export const productIdSchema = z.uuid();
export const variantIdSchema = z.uuid();

export const createProductRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug,
    description: z.string().trim().max(10_000).optional(),
    status: productStatusSchema.default('draft'),
    sku: sku.meta({ description: 'SKU of the master variant' }),
    publicMetadata: metadata.publicMetadata.optional(),
    privateMetadata: metadata.privateMetadata.optional(),
  })
  .meta({ id: 'CreateProductRequest' });

export const updateProductRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug,
    description: z.string().trim().max(10_000).nullable(),
    status: productStatusSchema,
    ...metadata,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateProductRequest' });

export const createVariantRequestSchema = z
  .object({
    sku,
    position: z.number().int().min(0).max(10_000).default(0),
    publicMetadata: metadata.publicMetadata.optional(),
    privateMetadata: metadata.privateMetadata.optional(),
  })
  .meta({ id: 'CreateVariantRequest' });

export const updateVariantRequestSchema = z
  .object({
    sku,
    position: z.number().int().min(0).max(10_000),
    ...metadata,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateVariantRequest' });

export type ProductDto = z.infer<typeof productSchema>;
export type VariantDto = z.infer<typeof variantSchema>;
export type ProductPageDto = z.infer<typeof productPageSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;
export type UpdateVariantRequest = z.infer<typeof updateVariantRequestSchema>;
