import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

/**
 * Stores and warehouses with opening hours (LOC-01). Other modules import
 * this module and use `LocationsService`, never the tables.
 */
@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
