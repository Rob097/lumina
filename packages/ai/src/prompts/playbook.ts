/**
 * GENERATION PLAYBOOK — owner-editable tuning rules (the fast correction loop).
 *
 * ┌─ HOW TO USE (no need to write prompts with an engineer) ────────────────────────────────────────────┐
 * │ When a generation comes out wrong and you know how it SHOULD behave, add ONE line to                 │
 * │ `GENERATION_RULES` below. Every rule here is injected into EVERY compose prompt as an                │
 * │ always-apply instruction, on top of the built-in HARD RULES.                                         │
 * │                                                                                                      │
 * │ Write a rule like you'd tell a person. Keep it GENERIC (about a behaviour or a kind of product),     │
 * │ never about one specific photo. Put the tested case + the problem in the `//` comment above it.      │
 * │ Then commit — it deploys automatically. The golden eval (`pnpm -F @lumina/api eval`) re-checks the   │
 * │ known cases so a new rule can't silently break an old one.                                           │
 * │                                                                                                      │
 * │ Example entry:                                                                                       │
 * │   // case: outdoor sofa — model added cushions that aren't in the product photo (2026-07-01)         │
 * │   'Never add, remove, or restyle parts of the product that are not visible in the product photo.',   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const GENERATION_RULES: string[] = [
  // case: lamp + acoustic panels (multi-product) — panels covered only a patch of the wall, not all of it (2026-06-23)
  'If a product is a surfacing or cladding material (acoustic/slat panels, tiles, wallpaper, flooring, decking, cladding), it must cover the ENTIRE appropriate surface edge-to-edge, repeating the unit to fill the whole area — never a single piece or a small patch on part of the surface.',
  // case: a floor/desk lamp rendered absurdly large when placed outdoors by an entrance (2026-06-23)
  'Keep every product at a realistic real-world size relative to people, doors (~200 cm tall) and existing furniture — e.g. a floor lamp is about 1.5–1.8 m tall. Never render a product many times larger or smaller than it really is.',
  // case: an exterior lamp came out as a bright glowing orb/sphere that hid the actual fixture (2026-06-23)
  'When the product is a lamp or light fixture, render the physical fixture itself — its exact shape, shade and material from the product photo. Any light it emits is a subtle, realistic glow; never replace, inflate or hide the fixture behind a bright blob, halo or sphere of light.',
  // case: slat wall panels were rendered rotated (horizontal) vs the product photo's vertical slats (2026-06-23)
  "Preserve the orientation of a product's pattern or repeating direction as shown in its photo — vertical slats stay vertical, planks/tiles keep their direction. Let perspective bend the lines along the surface, but never rotate or mirror the pattern.",
  // goal: product photos usually have a studio/white background or staging props that must NOT leak into the scene
  "Insert ONLY the product itself, never anything from its product photo — drop the product photo's own background, floor, shadows, props and packaging. The surroundings in the result must be the customer's scene alone.",
];

/**
 * The playbook rules rendered as one block to append to the compose prompt. Empty string when there are no
 * rules (so the prompt is unchanged). Kept separate from the built-in HARD RULES so the owner's tuning is
 * clearly additive and easy to audit.
 */
export function playbookRules(): string {
  if (GENERATION_RULES.length === 0) {
    return '';
  }
  return ['TEAM TUNING RULES (always apply, in addition to the HARD RULES):', ...GENERATION_RULES.map((r) => `- ${r}`)].join(
    '\n',
  );
}
