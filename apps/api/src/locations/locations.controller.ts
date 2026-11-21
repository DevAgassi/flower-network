import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import {
  type CreateLocationRequest,
  createLocationRequestSchema,
  includeArchivedSchema,
  type LocationDto,
  locationIdSchema,
  locationSchema,
  type UpdateLocationRequest,
  updateLocationRequestSchema,
} from './locations.contract.js';
import {
  type LocationWithHours,
  LocationsService,
} from './locations.service.js';

const error = (status: HttpStatus, description?: string) =>
  ({ status, description, standardSchema: apiErrorSchema }) as const;

/** Stores and warehouses. Every staff member reads; owner and admin manage. */
@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stores and warehouses, stores first' })
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: locationSchema.array(),
  })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  // Swagger cannot tell that the zod schema is optional.
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    enum: ['true', 'false'],
    description: 'Also return archived locations (default false)',
  })
  async list(
    @Query('includeArchived', { schema: includeArchivedSchema })
    includeArchived: 'true' | 'false' | undefined,
  ): Promise<LocationDto[]> {
    const rows = await this.locations.list({
      includeArchived: includeArchived === 'true',
    });
    return rows.map(toDto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One location with its opening hours' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: locationSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.UNAUTHORIZED))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  async get(
    @Param('id', { schema: locationIdSchema }) id: string,
  ): Promise<LocationDto> {
    return toDto(await this.locations.get(id));
  }

  @Post()
  @RequirePermission('locations:manage')
  @ApiOperation({
    summary: 'Create a store or a warehouse',
    description: 'A store needs latitude and longitude.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: locationSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Name already taken'))
  async create(
    @Body({ schema: createLocationRequestSchema }) body: CreateLocationRequest,
  ): Promise<LocationDto> {
    return toDto(await this.locations.create(body));
  }

  @Patch(':id')
  @RequirePermission('locations:manage')
  @ApiOperation({
    summary: 'Change a location, archive it, or replace its weekly hours',
    description: 'Locations are never deleted: set `status: archived`.',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: locationSchema })
  @ApiResponse(error(HttpStatus.BAD_REQUEST))
  @ApiResponse(error(HttpStatus.NOT_FOUND))
  @ApiResponse(error(HttpStatus.CONFLICT, 'Name already taken'))
  async update(
    @Param('id', { schema: locationIdSchema }) id: string,
    @Body({ schema: updateLocationRequestSchema }) body: UpdateLocationRequest,
  ): Promise<LocationDto> {
    return toDto(await this.locations.update(id, body));
  }
}

function toDto(location: LocationWithHours): LocationDto {
  return {
    id: location.id,
    name: location.name,
    kind: location.kind,
    status: location.status,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    phone: location.phone,
    hours: location.hours,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}
