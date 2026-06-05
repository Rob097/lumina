/**
 * eval-run — the quality eval harness (§M5.3). Composes a golden set of room+product pairs through the
 * AIOrchestrator and prints a launch-readiness report (success rate, latency, cost, 👍 rate by category,
 * scored by the pure `scoreEval`). Offline it uses the deterministic mock provider; set `FAL_KEY` (and
 * unset `AI_PROVIDER=mock`) to score the real model against a real golden set.
 *
 * Run: `pnpm -F @lumina/api eval`
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOrchestratorFromEnv, scoreEval, type EvalCaseResult } from '@lumina/ai';
import type { ProductCategory } from '@lumina/shared';

interface GoldenCase {
  id: string;
  category: ProductCategory;
  roomUrl: string;
  productUrl: string;
  placementHint?: string;
}

async function main(): Promise<void> {
  const goldenPath = fileURLToPath(new URL('./eval-golden.json', import.meta.url));
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenCase[];

  // Force the mock provider unless a real FAL_KEY is present (so the harness runs offline by default).
  const env = { ...process.env, AI_PROVIDER: process.env.FAL_KEY ? process.env.AI_PROVIDER : 'mock' };
  const orchestrator = createOrchestratorFromEnv(env);

  const results: EvalCaseResult[] = [];
  for (const c of golden) {
    try {
      const r = await orchestrator.compose({
        room: { url: c.roomUrl },
        product: { url: c.productUrl },
        category: c.category,
        placementHint: c.placementHint,
        policy: 'balanced',
      });
      results.push({
        id: c.id,
        category: c.category,
        status: 'succeeded',
        latencyMs: r.latencyMs,
        costCents: r.costCents,
      });
      console.log(`✓ ${c.id} (${c.category}) — ${r.model} ${r.latencyMs}ms ${r.costCents}¢`);
    } catch (err) {
      results.push({ id: c.id, category: c.category, status: 'failed' });
      console.log(`✗ ${c.id} (${c.category}) — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const report = scoreEval(results);
  console.log('\n=== eval report ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
