/**
 * eval-run — the quality eval harness (§M5.3, Generation Engine v3 Phase 0). Composes a golden set of
 * room+product pairs through the AIOrchestrator and prints a launch-readiness report (success rate,
 * latency, cost, 👍 rate — by category AND by input difficulty class, via the pure `scoreEval`).
 *
 * Golden images live as LOCAL FILES in `./golden/` (reproducible, no external host — the old `golden.lumina.app`
 * URLs never existed). Each case names a `room` + `product` file there; a case whose files are missing is
 * SKIPPED with a warning, so the harness runs on whatever pairs are present and the baseline grows as more
 * images are dropped in. Room files are EXIF auto-oriented + aspect-pinned to mirror the real ingest pipeline.
 * Outputs are written to `./golden/out/<id>.png` for human 👍 judgement, plus `./golden/out/results.json`.
 *
 * Offline it uses the deterministic mock provider; set `AI_GATEWAY_API_KEY` (and don't set `AI_PROVIDER=mock`)
 * to score the real model. Run: `pnpm -F @lumina/api eval`  (policy override: `GW_POLICY=quality`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  createOrchestratorFromEnv,
  planToSceneAnalysis,
  resolvePolicy,
  scoreEval,
  type EvalCaseResult,
  type ImageRef,
  type RoutingPolicy,
} from '@lumina/ai';
import type { ProductCategory } from '@lumina/shared';

interface GoldenCase {
  id: string;
  category: ProductCategory;
  /** Input difficulty class for the by-class regression breakdown. Defaults to 'standard'. */
  inputClass?: string;
  /** Local image filenames under ./golden/ (preferred). */
  room?: string;
  product?: string;
  /** URL fallbacks (used only when the local file is absent). */
  roomUrl?: string;
  productUrl?: string;
  placementHint?: string;
}

const goldenDir = fileURLToPath(new URL('./golden/', import.meta.url));
const outDir = fileURLToPath(new URL('./golden/out/', import.meta.url));

/** Nearest simple aspect ratio 'W:H' for the aspect pin (mirrors images/dimensions.ts intent). */
function nearestAspectRatio(w: number, h: number): string {
  const ratios: Array<[string, number]> = [
    ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16],
    ['3:2', 3 / 2], ['2:3', 2 / 3], ['5:4', 5 / 4], ['4:5', 4 / 5],
  ];
  const target = w / h;
  let best = ratios[0]!;
  for (const r of ratios) {
    if (Math.abs(r[1] - target) < Math.abs(best[1] - target)) best = r;
  }
  return best[0];
}

interface ResolvedRoom {
  ref: ImageRef;
  aspectRatio?: string;
}

/** Resolve the room image: prefer a local file (EXIF-baked + aspect-pinned), else a URL. Null ⇒ missing. */
async function resolveRoom(c: GoldenCase): Promise<ResolvedRoom | null> {
  if (c.room && existsSync(goldenDir + c.room)) {
    const raw = new Uint8Array(readFileSync(goldenDir + c.room));
    const baked = new Uint8Array(await sharp(raw).rotate().toBuffer()); // bake EXIF orientation (ingest parity)
    const meta = await sharp(baked).metadata();
    const aspectRatio = meta.width && meta.height ? nearestAspectRatio(meta.width, meta.height) : undefined;
    return { ref: { bytes: baked, contentType: `image/${meta.format ?? 'jpeg'}` }, aspectRatio };
  }
  if (c.roomUrl) {
    return { ref: { url: c.roomUrl } };
  }
  return null;
}

/** Resolve the product image: prefer a local file, else a URL. Null ⇒ missing. */
function resolveProduct(c: GoldenCase): ImageRef | null {
  if (c.product && existsSync(goldenDir + c.product)) {
    return { bytes: new Uint8Array(readFileSync(goldenDir + c.product)), contentType: 'image/jpeg' };
  }
  if (c.productUrl) {
    return { url: c.productUrl };
  }
  return null;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const goldenPath = fileURLToPath(new URL('./eval-golden.json', import.meta.url));
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenCase[];

  // Force the mock provider unless real gateway creds are present (so the harness runs offline by default).
  const hasGatewayCreds = Boolean(process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN);
  const env = { ...process.env, AI_PROVIDER: hasGatewayCreds ? process.env.AI_PROVIDER : 'mock' };
  const orchestrator = createOrchestratorFromEnv(env);
  const policy = (process.env.GW_POLICY ?? 'balanced') as RoutingPolicy;

  const results: EvalCaseResult[] = [];
  let skipped = 0;
  for (const c of golden) {
    const inputClass = c.inputClass ?? 'standard';
    const room = await resolveRoom(c);
    const product = resolveProduct(c);
    if (!room || !product) {
      skipped += 1;
      console.log(`⊘ ${c.id} (${c.category} · ${inputClass}) — skipped: missing ${!room ? 'room' : 'product'} image`);
      continue;
    }
    try {
      // Planner-driven path (mirrors the workflow, Phase 1): one reasoning pass → the plan, whose per-image
      // facts feed compose via the SceneAnalysis it consumes. Best-effort — a planner failure falls back to
      // composing without facts (a neutral plan), exactly like the durable pipeline.
      let scene: ReturnType<typeof planToSceneAnalysis> | undefined;
      let plan: Awaited<ReturnType<typeof orchestrator.plan>> = null;
      try {
        plan = await orchestrator.plan({ room: room.ref, product, productName: c.id, category: c.category });
        if (plan) scene = planToSceneAnalysis(plan);
      } catch {
        plan = null;
      }
      const mode = plan?.mode ?? 'n/a';
      const r = await orchestrator.compose({
        room: room.ref,
        product,
        category: c.category,
        placementHint: c.placementHint,
        ...(scene ? { scene } : {}),
        // The mode-specific task (§4.2) is what makes covering work without a hint — drive it from the plan.
        ...(plan ? { mode: plan.mode, target: plan.target, repetition: plan.repetition } : {}),
        ...(room.aspectRatio ? { aspectRatio: room.aspectRatio } : {}),
        // Phase 3 routing: derive fast/quality from the plan (fast common path, escalate on difficulty).
        policy: plan ? resolvePolicy(process.env.GW_MERCHANT_PLAN ?? 'starter', plan) : policy,
      });
      const ext = (r.contentType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
      writeFileSync(`${outDir}${c.id}.${ext}`, r.bytes);
      results.push({ id: c.id, category: c.category, inputClass, status: 'succeeded', latencyMs: r.latencyMs, costCents: r.costCents });
      console.log(`✓ ${c.id} (${c.category} · ${inputClass}) [mode=${mode}] — ${r.model} ${r.latencyMs}ms ${r.costCents}¢ → out/${c.id}.${ext}`);
    } catch (err) {
      results.push({ id: c.id, category: c.category, inputClass, status: 'failed' });
      console.log(`✗ ${c.id} (${c.category} · ${inputClass}) — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Persist per-case records (thumbsUp left null) so a human can rate the saved outputs and we re-score.
  writeFileSync(`${outDir}results.json`, JSON.stringify(results.map((r) => ({ ...r, thumbsUp: null })), null, 2));

  const report = scoreEval(results);
  console.log(`\n=== eval report (${results.length} run, ${skipped} skipped) ===`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
