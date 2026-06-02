import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { generationRequested } from '@/lib/inngest/generation';

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generationRequested],
});
