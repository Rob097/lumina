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
 * FASHION playbook — the owner-editable tuning loop for the person/accessory path, kept SEPARATE from the
 * furniture rules above so the furniture-specific scale rules (floor-lamp heights, door references, surface
 * cladding) never leak into a portrait prompt. Add one generic line here when a fashion generation comes out
 * wrong; it is injected into every fashion compose prompt. Same format/usage as `GENERATION_RULES`.
 */
export const FASHION_GENERATION_RULES: string[] = [
  // case: bag rendered far too large (torso-sized), ignoring the real 20x10cm dimensions (2026-06-26)
  "Render the accessory at its REAL-WORLD size — when dimensions are given they are the authority. Anchor to the body: an adult hand is about 18 cm long, so a small handbag (e.g. 20x10 cm) is only about the size of one hand. Never enlarge it to fill the torso or the frame.",
  // case: a bag rendered on EACH arm (two bags) when both arms were bent / both hands held the phone (2026-06-26)
  "Add EXACTLY ONE bag, carried on ONE arm only — never a second bag on the other arm, never duplicated or mirrored. Even if both arms look free or both hands hold the phone, only one arm carries the single bag; the other arm stays exactly as in the original.",
  // case: fingers rendered behind the handle instead of gripping it / bag fused into the clothing
  'Carry the accessory on the existing arm: where the hand grips the handle, render the fingers and thumb OVER it; where the bag hangs from the forearm or the crook of the elbow, loop the handle over the arm. It never floats in front of the arm and never fuses into the clothing.',
  // case: bag held by an INVENTED third arm/hand instead of the person's existing free arm — the pose was a forearm/elbow carry (2026-06-26)
  "Carry the accessory on the arm the subject ALREADY has free (e.g. on a mirror selfie, the one not holding the phone) — hanging from the hand, or looped over the forearm / in the crook of the elbow as the handle suggests. NEVER add, duplicate, or invent a new hand, arm, or finger; the subject has only the limbs already shown. If the free hand isn't gripping, hang the bag on that existing arm rather than creating another arm to hold it.",
  // case: the added handbag came out slightly see-through — the body/background showed through it (2026-06-24)
  'Render the accessory as a fully opaque, solid object that completely hides whatever is behind it; never make it semi-transparent, translucent, ghosted, or a see-through overlay. The only parts that may be see-through are ones that are genuinely transparent in the product photo itself (e.g. clear plastic or mesh).',
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
