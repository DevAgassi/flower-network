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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../identity/auth.decorators.js';
import { apiErrorSchema } from '../openapi/errors.contract.js';
import type { Taxonomy } from './catalog.schema.js';
import {
  type CreateTaxonomyRequest,
  createTaxonomyRequestSchema,
  type CreateTaxonRequest,
  createTaxonRequestSchema,
  type TaxonDto,
  type TaxonomyDto,
  taxonomyIdSchema,
  taxonomySchema,
  taxonIdSchema,
  taxonSchema,
  type UpdateTaxonomyRequest,
  updateTaxonomyRequestSchema,
  type UpdateTaxonRequest,
  updateTaxonRequestSchema,
} from './catalog.contract.js';
import { type TaxonNode, TaxonomyService } from './taxonomy.service.js';

const error = (status: HttpStatus, description?: string) =>
  ({ status, description, standardSchema: apiErrorSchema }) as const;

/** Category trees: every staff member reads, owner and admin manage. */
@ApiTags('catalog')
@Controller('taxonomies')
export class TaxonomiesController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'All taxonomies (Category, Occasion, …)' })
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: taxonomySchema.array(),
  })
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  async list(): Promise<TaxonomyDto[]> {
    return (await this.taxonomy.listTaxonomies()).map(toTaxonomyDto);
  }

  @Post()
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Create a taxonomy' })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: taxonomySchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Slug already used'))
  async create(
    @Body({ schema: createTaxonomyRequestSchema }) body: CreateTaxonomyRequest,
  ): Promise<TaxonomyDto> {
    return toTaxonomyDto(await this.taxonomy.createTaxonomy(body));
  }

  @Patch(':id')
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Change a taxonomy' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: taxonomySchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Slug already used'))
  async update(
    @Param('id', { schema: taxonomyIdSchema }) id: string,
    @Body({ schema: updateTaxonomyRequestSchema }) body: UpdateTaxonomyRequest,
  ): Promise<TaxonomyDto> {
    return toTaxonomyDto(await this.taxonomy.updateTaxonomy(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Delete a taxonomy with all its taxons (soft delete)',
    description: 'Products are unlinked from the deleted taxons.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async remove(
    @Param('id', { schema: taxonomyIdSchema }) id: string,
  ): Promise<void> {
    await this.taxonomy.removeTaxonomy(id);
  }

  @Get(':id/taxons')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The whole tree of a taxonomy',
    description:
      'Flat list in depth-first order: each parent before its children, siblings by position.',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: taxonSchema.array() })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async tree(
    @Param('id', { schema: taxonomyIdSchema }) id: string,
  ): Promise<TaxonDto[]> {
    return (await this.taxonomy.tree(id)).map(toTaxonDto);
  }

  @Post(':id/taxons')
  @RequirePermission('catalog:manage')
  @ApiOperation({ summary: 'Add a taxon (top level or under a parent)' })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: taxonSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST, 'Invalid body or unknown parent'))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'A sibling uses this slug'))
  async createTaxon(
    @Param('id', { schema: taxonomyIdSchema }) id: string,
    @Body({ schema: createTaxonRequestSchema }) body: CreateTaxonRequest,
  ): Promise<TaxonDto> {
    return toTaxonDto(await this.taxonomy.createTaxon(id, body));
  }
}

/** One taxon: rename, move, reorder, delete. */
@ApiTags('catalog')
@Controller('taxons')
export class TaxonsController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Patch(':id')
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Rename, move or reorder a taxon',
    description:
      'A new slug or parent rewrites the paths of the whole subtree. Moving into its own subtree is rejected.',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: taxonSchema })
  @ApiResponse(
    error(HttpStatus.BAD_REQUEST, 'Move into own subtree, or unknown parent'),
  )
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'A sibling uses this slug'))
  async update(
    @Param('id', { schema: taxonIdSchema }) id: string,
    @Body({ schema: updateTaxonRequestSchema }) body: UpdateTaxonRequest,
  ): Promise<TaxonDto> {
    return toTaxonDto(await this.taxonomy.updateTaxon(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('catalog:manage')
  @ApiOperation({
    summary: 'Delete a taxon with its subtree (soft delete)',
    description: 'Products are unlinked from the deleted taxons.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async remove(
    @Param('id', { schema: taxonIdSchema }) id: string,
  ): Promise<void> {
    await this.taxonomy.removeTaxon(id);
  }
}

function toTaxonomyDto(taxonomy: Taxonomy): TaxonomyDto {
  return {
    id: taxonomy.id,
    name: taxonomy.name,
    slug: taxonomy.slug,
    position: taxonomy.position,
  };
}

function toTaxonDto(taxon: TaxonNode): TaxonDto {
  return {
    id: taxon.id,
    taxonomyId: taxon.taxonomyId,
    parentId: taxon.parentId,
    name: taxon.name,
    slug: taxon.slug,
    path: taxon.path,
    depth: taxon.depth,
    position: taxon.position,
  };
}
