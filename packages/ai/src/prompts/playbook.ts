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

/**
 * FASHION playbook — the owner-editable tuning loop for the person/try-on path, kept SEPARATE from the
 * furniture rules above so the furniture-specific scale rules (floor-lamp heights, door references, surface
 * cladding) never leak into a portrait prompt. Rules here are GENERIC across fashion items (jewellery, bags,
 * eyewear, hats, garments) — never hardcoded to one product type, so they apply to any product. Add one generic
 * line when a fashion generation comes out wrong; it is injected into every fashion compose prompt.
 */
export const FASHION_GENERATION_RULES: string[] = [
  // case: item rendered far too large (torso-sized), ignoring the real dimensions (e.g. a 20x10cm bag) (2026-06-26)
  'Render the product at its REAL-WORLD size — when dimensions are given they are the authority. A small item stays small (for reference an adult hand is about 18 cm long); never enlarge it to fill the torso or the frame.',
  // case: a single item duplicated (a bag on each arm), or a body part invented to wear it (2026-06-26)
  'Put on ONLY the product, in the natural number of pieces for its type — a single bag, hat, ring or watch, or a matched PAIR (earrings, one per earlobe). Never duplicate a single item onto a second spot, never split a set, and never add or duplicate a hand, arm, finger, ear, or any body part to wear it.',
  // case: item placed where it does not belong / wrong arm — follow the product type, the guide, and the pose (2026-06-26)
  "Place the product where its KIND of item is worn or carried on the body (earrings on the lobes, a bag on the hand/forearm, glasses on the face, a hat on the head, etc.), following the merchant's placement-guide image when one is provided (as the example of where/how) and the subject's actual pose. For a hand-carried item, prefer the arm the subject has clearly prepared to receive it.",
  // case: a handbag gripped flat in the hand instead of hanging from the bent elbow our pose guide asks shoppers to use (2026-06-26)
  "For a HANDBAG carried on the arm: when the subject has a BENT or raised arm (a hand up near the chest/shoulder with the elbow bent — the pose our guide tells shoppers to strike), HANG the bag from the crook of that bent elbow / over that forearm so it dangles in front of the body by its handle. Do NOT render it gripped flat in the fingers or resting in the palm — the bag hangs from the bent arm and the hand stays free.",
  // case: the added item came out slightly see-through — the body/background showed through it (2026-06-24)
  'Render the product as a fully opaque, solid object that hides whatever is behind it; never make it semi-transparent, translucent, ghosted, or see-through — unless the product is genuinely transparent in its own photo (e.g. clear lenses, sheer fabric, mesh).',
];

/** The fashion playbook rules rendered as one always-apply block (empty string when there are none). */
export function fashionPlaybookRules(): string {
  if (FASHION_GENERATION_RULES.length === 0) {
    return '';
  }
  return [
    'TEAM TUNING RULES (always apply, in addition to the HARD RULES):',
    ...FASHION_GENERATION_RULES.map((r) => `- ${r}`),
  ].join('\n');
}
