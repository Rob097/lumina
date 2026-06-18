/**
 * gw-smoke — one real composition through the Vercel AI Gateway (D49) to validate the migration end to
 * end. Uses local sample bytes (room + product) so the model gets the images directly. Costs a few cents.
 * Run: AI_GATEWAY_API_KEY=… GW_POLICY=fast pnpm -F @lumina/api exec tsx scripts/gw-smoke.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createOrchestratorFromEnv } from '@lumina/ai';

async function main(): Promise<void> {
  const room = new Uint8Array(readFileSync('/tmp/room.jpg'));
  const product = new Uint8Array(readFileSync('/tmp/product.jpg'));
  const policy = (process.env.GW_POLICY ?? 'fast') as 'quality' | 'balanced' | 'fast';

  console.log(
    `creds: AI_GATEWAY_API_KEY=${process.env.AI_GATEWAY_API_KEY ? 'set' : 'MISSING'} | ` +
      `AI_PROVIDER=${process.env.AI_PROVIDER ?? '(unset)'} | policy=${policy}`,
  );

  const orchestrator = createOrchestratorFromEnv(process.env);
  const res = await orchestrator.compose({
    room: { bytes: room, contentType: 'image/jpeg' },
    product: { bytes: product, contentType: 'image/jpeg' },
    category: 'lighting',
    placementHint: 'in the corner next to the sofa',
    policy,
  });

  const ext = (res.contentType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
  const out = `/tmp/gw-out.${ext}`;
  writeFileSync(out, res.bytes);

  console.log('OK ✓');
  console.log({
    model: res.model,
    costCents: res.costCents,
    latencyMs: res.latencyMs,
    contentType: res.contentType,
    bytes: res.bytes.length,
    width: res.width,
    height: res.height,
    saved: out,
  });
}

main().catch((e: unknown) => {
  console.error('FAILED ✗');
  console.error(e);
  if (e && typeof e === 'object' && 'attempts' in e) {
    console.error('attempts:', JSON.stringify((e as { attempts: unknown }).attempts, null, 2));
  }
  process.exit(1);
});
