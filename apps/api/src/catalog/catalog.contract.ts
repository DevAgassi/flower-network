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
    taxonIds: z.array(z.uuid()).meta({
      description: 'Taxons the product is in, across all taxonomies',
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
  taxonId: z.uuid().optional().meta({
    description: 'Only products in this taxon or any of its descendants',
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

// ---- Taxonomies and taxons (CAT-02) ----

const taxonSlug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase a-z, 0-9 and single hyphens')
  .meta({ example: 'roses' });
const position = z.number().int().min(0).max(10_000);

export const taxonomySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    position: z.number().int(),
  })
  .meta({ id: 'Taxonomy', description: 'An independent tree of categories' });

export const taxonSchema = z
  .object({
    id: z.uuid(),
    taxonomyId: z.uuid(),
    parentId: z.uuid().nullable(),
    name: z.string(),
    slug: z.string(),
    path: z.string().meta({
      description: 'Slugs from the top, dot-separated',
      example: 'flowers.roses.ecuador',
    }),
    depth: z.number().int().meta({ description: '1 for a top-level taxon' }),
    position: z.number().int(),
  })
  .meta({ id: 'Taxon' });

export const taxonomyIdSchema = z.uuid();
export const taxonIdSchema = z.uuid();

export const createTaxonomyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: taxonSlug,
    position: position.default(0),
  })
  .meta({ id: 'CreateTaxonomyRequest' });

export const updateTaxonomyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: taxonSlug,
    position,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateTaxonomyRequest' });

export const createTaxonRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: taxonSlug,
    parentId: z.uuid().optional().meta({ description: 'Omit for top level' }),
    position: position.default(0),
  })
  .meta({ id: 'CreateTaxonRequest' });

export const updateTaxonRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: taxonSlug,
    parentId: z.uuid().nullable().meta({
      description:
        'Move under another taxon of the same taxonomy; null = top level',
    }),
    position,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateTaxonRequest' });

export const setProductTaxonsRequestSchema = z
  .object({
    taxonIds: z.array(z.uuid()).max(100).meta({
      description: "Replaces the product's taxons (any taxonomies)",
    }),
  })
  .meta({ id: 'SetProductTaxonsRequest' });

export type TaxonomyDto = z.infer<typeof taxonomySchema>;
export type TaxonDto = z.infer<typeof taxonSchema>;
export type CreateTaxonomyRequest = z.infer<typeof createTaxonomyRequestSchema>;
export type UpdateTaxonomyRequest = z.infer<typeof updateTaxonomyRequestSchema>;
export type CreateTaxonRequest = z.infer<typeof createTaxonRequestSchema>;
export type UpdateTaxonRequest = z.infer<typeof updateTaxonRequestSchema>;
export type SetProductTaxonsRequest = z.infer<
  typeof setProductTaxonsRequestSchema
>;
