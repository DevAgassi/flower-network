import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { ProductsController } from './products.controller.js';

/**
 * Products and variants (CAT-01); categories, options, prices, media and
 * bouquet recipes join here (CAT-02…06). Other modules use `CatalogService`.
 */
@Module({
  controllers: [ProductsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
