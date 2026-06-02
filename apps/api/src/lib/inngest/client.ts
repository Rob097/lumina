import { EventSchemas, Inngest } from 'inngest';

type Events = {
  'generation.requested': { data: { generationId: string; merchantId: string } };
};

export const inngest = new Inngest({
  id: 'lumina',
  schemas: new EventSchemas().fromRecord<Events>(),
});
