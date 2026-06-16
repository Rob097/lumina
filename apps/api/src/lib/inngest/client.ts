import { EventSchemas, Inngest } from 'inngest';

type Events = {
  'generation.requested': { data: { generationId: string; merchantId: string } };
  /** Eagerly compute + cache a product's background-removed cutout (Phase 1 / D63). */
  'product.image.process': { data: { productId: string; merchantId: string } };
};

export const inngest = new Inngest({
  id: 'lumina',
  schemas: new EventSchemas().fromRecord<Events>(),
});
