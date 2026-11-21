import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../identity/auth.decorators.js';
import { apiErrorSchema } from '../openapi/errors.contract.js';
import { MAX_PAGE_SIZE } from '../openapi/pagination.contract.js';
import {
  type CreateProductRequest,
  createProductRequestSchema,
  type CreateVariantRequest,
  createVariantRequestSchema,
  type ListProductsQuery,
  listProductsQuerySchema,
  type ProductDto,
  productIdSchema,
  type ProductPageDto,
  productPageSchema,
  productSchema,
  productStatusSchema,
  type SetProductTaxonsRequest,
  setProductTaxonsRequestSchema,
  type UpdateProductRequest,
  updateProductRequestSchema,
  type UpdateVariantRequest,
  updateVariantRequestSchema,
  type VariantDto,
  variantIdSchema,
  variantSchema,
} from './catalog.contract.js';
import type { ProductVariant } from './catalog.schema.js';
import {
  CatalogService,
  type ProductWithVariants,
  sellableVariants,
} from './catalog.service.js';
import { TaxonomyService } from './taxonomy.service.js';

const error = (status: HttpStatus, description?: string) =>
  ({ status, description, standardSchema: apiErrorSchema }) as const;

/** Products and variants. Every staff member reads; owner and admin manage. */
@ApiTags('catalog')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Products, newest first, one page at a time' })
  // Swagger does not expand a query object schema into parameters.
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `Page size, 1–${MAX_PAGE_SIZE} (default 50)`,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    format: 'uuid',
    description: '`nextCursor` of the previous page',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: productStatusSchema.options,
  })
  @ApiQuery({
    name: 'taxonId',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Only products in this taxon or any of its descendants',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Search in product names and SKUs',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: productPageSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  async list(
    @Query({ schema: listProductsQuerySchema }) query: ListProductsQuery,
  ): Promise<ProductPageDto> {
    const page = await this.catalog.list(query);
    return { items: page.items.map(toProductDto), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One product with its variants' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: productSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async get(
    @Param('id', { schema: productIdSchema }) id: string,
  ): Promise<ProductDto> {
    return toProductDto(await this.catalog.get(id));
  }

  @Post()
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Create a product with its master variant',
    description: 'Starts as `draft` unless another status is given.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: productSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Slug or SKU already used'))
  async create(
    @Body({ schema: createProductRequestSchema }) body: CreateProductRequest,
  ): Promise<ProductDto> {
    return toProductDto(await this.catalog.create(body));
  }

  @Patch(':id')
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Change a product' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: productSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Slug already used'))
  async update(
    @Param('id', { schema: productIdSchema }) id: string,
    @Body({ schema: updateProductRequestSchema }) body: UpdateProductRequest,
  ): Promise<ProductDto> {
    return toProductDto(await this.catalog.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Delete a product and its variants (soft delete)',
    description:
      'Hidden from the catalog; orders and stock history keep pointing at it. Its slug and SKUs become free.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async remove(
    @Param('id', { schema: productIdSchema }) id: string,
  ): Promise<void> {
    await this.catalog.remove(id);
  }

  @Put(':id/taxons')
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: "Replace the product's taxons",
    description: 'Any taxonomies; new links go last inside each taxon.',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: productSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST, 'Unknown taxon, or invalid id'))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async setTaxons(
    @Param('id', { schema: productIdSchema }) id: string,
    @Body({ schema: setProductTaxonsRequestSchema })
    body: SetProductTaxonsRequest,
  ): Promise<ProductDto> {
    return toProductDto(
      await this.taxonomy.setProductTaxons(id, body.taxonIds),
    );
  }

  @Post(':id/variants')
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Add a variant to a product' })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: variantSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'SKU already used'))
  async addVariant(
    @Param('id', { schema: productIdSchema }) id: string,
    @Body({ schema: createVariantRequestSchema }) body: CreateVariantRequest,
  ): Promise<VariantDto> {
    return toVariantDto(await this.catalog.addVariant(id, body));
  }

  @Patch(':id/variants/:variantId')
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Change a variant' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: variantSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'SKU already used'))
  async updateVariant(
    @Param('id', { schema: productIdSchema }) id: string,
    @Param('variantId', { schema: variantIdSchema }) variantId: string,
    @Body({ schema: updateVariantRequestSchema }) body: UpdateVariantRequest,
  ): Promise<VariantDto> {
    return toVariantDto(await this.catalog.updateVariant(id, variantId, body));
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Delete a variant (soft delete)',
    description: 'The master variant is deleted only with its product.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiResponse(error(HttpStatus.BAD_REQUEST, 'Master variant, or invalid id'))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async removeVariant(
    @Param('id', { schema: productIdSchema }) id: string,
    @Param('variantId', { schema: variantIdSchema }) variantId: string,
  ): Promise<void> {
    await this.catalog.removeVariant(id, variantId);
  }
}

function toVariantDto(variant: ProductVariant): VariantDto {
  return {
    id: variant.id,
    sku: variant.sku,
    isMaster: variant.isMaster,
    position: variant.position,
    publicMetadata: variant.publicMetadata,
    privateMetadata: variant.privateMetadata,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

function toProductDto(product: ProductWithVariants): ProductDto {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    status: product.status,
    publicMetadata: product.publicMetadata,
    privateMetadata: product.privateMetadata,
    variants: product.variants.map(toVariantDto),
    taxonIds: product.taxonIds,
    sellableVariantIds: sellableVariants(product.variants).map((v) => v.id),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
