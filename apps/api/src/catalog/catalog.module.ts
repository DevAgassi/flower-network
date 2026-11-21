import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { ProductsController } from './products.controller.js';
import {
  TaxonomiesController,
  TaxonsController,
} from './taxonomies.controller.js';
import { TaxonomyService } from './taxonomy.service.js';

/**
 * Products and variants (CAT-01), taxonomies and taxons (CAT-02); options,
 * prices, media and bouquet recipes join here (CAT-03…06). Other modules use `CatalogService`.
 */
@Module({
  controllers: [ProductsController, TaxonomiesController, TaxonsController],
  providers: [CatalogService, TaxonomyService],
  exports: [CatalogService],
})
export class CatalogModule {}
