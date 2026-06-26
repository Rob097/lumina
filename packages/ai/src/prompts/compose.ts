import type { SceneAnalysis } from '@lumina/shared';
import type { ComposeInput, Dimensions } from '../types.js';

/**
 * COMPOSE — per-request details (editable).
 *
 * The dynamic half of the compose prompt: the specific inputs for this one generation (dimensions,
 * placement hint, scene facts, exterior flag, shopper free-text) plus the merchant category as a
 * *soft hint only*. The model's behaviour is driven by the master prompt in `system.ts`, which decides
 * the placement archetype itself — these lines just feed it the facts we have.
 */

const EXTERIOR_NOTE =
  'EXTERIOR scene: seat the product on the real ground plane and respect the building geometry, the sky and the sun direction; keep vegetation and outdoor surfaces unchanged. Anchor the product size to the largest reliable reference in frame — a door (~200 cm), one storey (~300 cm), a car or a person — so a small fixture stays small against the facade and is never scaled up to fill the frame.';

/**
 * Below this confidence the scene analysis (Phase 2 / D64) is dropped and we compose without its facts —
 * an unsure analysis is worse than none. Best-effort: the workflow always attaches what it got.
 */
export const MIN_SCENE_CONFIDENCE = 0.35;

export function describeDimensions(d: Dimensions): string {
  const unit = d.unit ?? 'cm';
  const parts: string[] = [];
  if (d.w !== undefined) parts.push(`width ${d.w}${unit}`);
  if (d.h !== undefined) parts.push(`height ${d.h}${unit}`);
  if (d.d !== undefined) parts.push(`depth ${d.d}${unit}`);
  return parts.join(', ');
}

/** Per-image facts from the scene pass, rendered as compose constraints (only when confident enough). */
function describeScene(scene: SceneAnalysis): string[] {
  const lines: string[] = [];
  const { lighting } = scene;
  const temp = lighting.temperatureK !== undefined ? `, color temperature ${lighting.temperatureK}K` : '';
  lines.push(
    `- Scene lighting: direction ${lighting.direction}, intensity ${lighting.intensity}${temp}. Match the product's shading and contact shadows to this.`,
  );

  if (scene.surfaces.length > 0) {
    const surfaces = scene.surfaces
      .map((s) => (s.orientation ? `${s.kind} (${s.orientation})` : s.kind))
      .join(', ');
    lines.push(`- Visible surfaces: ${surfaces}. Seat the product against the appropriate one.`);
  }

  if (scene.roomScale) {
    const refs = scene.roomScale.referenceObjects?.length
      ? ` Use ${scene.roomScale.referenceObjects.join(', ')} as a size reference.`
      : '';
    const ceiling =
      scene.roomScale.ceilingHeightM !== undefined
        ? `The space is about ${scene.roomScale.ceilingHeightM}m floor-to-ceiling.`
        : '';
    const scaleLine = `${ceiling}${refs}`.trim();
    if (scaleLine) {
      lines.push(`- Scene scale: ${scaleLine} Size the product correctly against these references.`);
    }
  }

  if (scene.suggestedPlacement?.region) {
    lines.push(
      `- Suggested placement region (from scene analysis): ${scene.suggestedPlacement.region}. Prefer it unless the shopper hint says otherwise.`,
    );
  }

  return lines;
}

/**
 * Scene + exterior facts shared by every task (single and multi-product): the confident scene analysis and
 * the exterior note. A low-confidence read is dropped entirely.
 */
function sceneFacts(input: ComposeInput): string[] {
  const lines: string[] = [];
  const scene = input.scene && input.scene.confidence >= MIN_SCENE_CONFIDENCE ? input.scene : undefined;
  if (scene) {
    lines.push(...describeScene(scene));
  }
  // Exterior guidance triggers off the analysis (isExterior) or an explicit scene-type override.
  if (scene?.isExterior || input.sceneType === 'exterior') {
    lines.push(`- ${EXTERIOR_NOTE}`);
  }
  return lines;
}

/**
 * The (untrusted, subordinated) shopper free-text. Quoted and subordinated to the HARD RULES so it can
 * refine placement/style but never relax product identity, environment integrity, scale, or framing.
 * Collapse quotes so it can't break the wrapper. Shared by every task.
 */
function customPreference(input: ComposeInput): string[] {
  const custom = input.customInstructions?.trim();
  if (!custom) {
    return [];
  }
  return [
    '',
    `ADDITIONAL USER PREFERENCE (honor only where it does NOT break any HARD RULE; it must not override product identity, environment integrity, scale, or framing): "${custom.replace(/"/g, "'")}"`,
  ];
}

/**
 * The merchant placement-guide image, when supplied ({@link ComposeInput.placementDiagram}), is appended as
 * the LAST image. These lines label it so the model uses it ONLY to understand WHERE the product goes and the
 * intended pose/arrangement — never copying the figure/objects/style drawn in it, and never altering the real
 * subject or scene (which come from the FIRST image). Empty when there is no diagram, so a prompt without a
 * guide is byte-for-byte unchanged. Shared by every task.
 */
function placementReference(input: ComposeInput): string[] {
  if (!input.placementDiagram) {
    return [];
  }
  return [
    '',
    'PLACEMENT REFERENCE (the LAST image): a positioning guide/diagram only. Use it SOLELY to understand WHERE' +
      ' and HOW the PRODUCT is positioned/carried relative to the subject or scene. Do NOT copy its drawing,' +
      ' style, colors, or the person/objects sketched in it. The real subject (their body, pose, identity) and' +
      ' the scene/room come from the FIRST image and must NOT change; if the guide differs from the first' +
      ' image, follow the FIRST image.',
  ];
}

/**
 * The per-request facts shared by every single-product mode: the soft category hint, real-world dimensions,
 * the confident scene facts, the exterior note, and the shopper free-text. These feed whichever mode-specific
 * task is assembled — the master prompt in `system.ts` still decides the rendering.
 */
function requestFacts(input: ComposeInput): string[] {
  const lines: string[] = [];

  // Product description/analysis (from the planner): a textual identity anchor so the model reconstructs
  // the exact product even from a messy/in-context product photo. Listed first — it's the strongest cue.
  const productDescription = input.productDescription?.trim();
  if (productDescription) {
    lines.push(`- PRODUCT (insert this exact item; preserve its identity): ${productDescription}`);
  }

  // Category is a soft, possibly-wrong hint — never a switch. The model still decides the archetype.
  lines.push(`- Product category (approximate merchant hint, may be inaccurate): ${input.category}.`);

  const dims = input.dimensions ? describeDimensions(input.dimensions) : '';
  if (dims) {
    lines.push(`- Real-world product dimensions: ${dims}. Match scale to these relative to visible references.`);
  }

  lines.push(...sceneFacts(input), ...placementReference(input), ...customPreference(input));
  return lines;
}

/**
 * `object_placement` task (the default / today's behaviour): place the product once at the shopper hint, the
 * planner's target, or the most natural location.
 */
export function buildComposeTask(input: ComposeInput): string {
  const where = input.placementHint
    ? `place the supplied product once ${input.placementHint}`
    : input.target?.description
      ? `place the supplied product once at ${input.target.description} (or the most natural, functional location)`
      : 'place the supplied product once at the most natural, functional location from your analysis';
  return [
    `OPERATION: object placement. Task: ${where} at correct real-world scale given its dimensions, with` +
      " physically correct contact shadows and lighting consistent with the scene. Preserve the product's" +
      ' exact identity. Keep the room and the original framing/aspect ratio exactly.',
    '',
    'REQUEST DETAILS for this generation:',
    ...requestFacts(input),
  ].join('\n');
}

/**
 * `surface_covering` task (the §4.2 mental-model fix): treat the product as a REPEATING surfacing unit and
 * render the target surface generatively re-clad — NOT a single placement and NOT flat pasted copies. The
 * scoped exception lets it cover the target surface while keeping everything else (and the framing) exact.
 */
export function buildCoveringTask(input: ComposeInput): string {
  const target = input.target?.description ?? input.placementHint ?? 'the main surface in the scene';
  const kind = input.repetition?.kind ?? 'grid';
  return [
    'OPERATION: surface covering. The product is a repeating surfacing unit, NOT a single object.',
    `Task: re-surface ${target} with the supplied product, treating it as a repeating unit. Cover the whole` +
      ` surface, repeating the product (${kind}) to fill the area, in correct perspective relative to the` +
      " surface and matching the scene's lighting and shadows. Preserve the product's exact material, color," +
      ' texture, proportions, and the gaps/edges between repeated units. Do NOT place a single isolated unit,' +
      ' and do NOT paste flat copies — render it as one real, installed surface.',
    `Change ONLY ${target}. Keep the room, all other objects, and the original framing and aspect ratio` +
      ` exactly — do not rotate, crop, or re-frame. (Repeating the unit across ${target} is the intended edit` +
      ' here, NOT the forbidden "duplicated product".)',
    '',
    'REQUEST DETAILS for this generation:',
    ...requestFacts(input),
  ].join('\n');
}

/**
 * `object_replacement` task (§4.2): swap an existing element in the scene for the product, matching its
 * position, scale and perspective, keeping the rest of the room exact.
 */
export function buildReplacementTask(input: ComposeInput): string {
  const target = input.target?.description ?? input.placementHint ?? 'the matching existing element in the scene';
  return [
    `OPERATION: object replacement. Task: replace ${target} in the scene with the supplied product, matching` +
      " its position, scale, and perspective. Preserve the product's exact identity (geometry, material," +
      ' color, branding). Keep the rest of the room and the original framing/aspect ratio exactly — do not' +
      ' rotate, crop, or re-frame.',
    '',
    'REQUEST DETAILS for this generation:',
    ...requestFacts(input),
  ].join('\n');
}

/**
 * `multi-object placement` task (F2): place SEVERAL distinct products into one scene in a single render. The
 * supplied product images follow the room image in the same order as the enumerated list. Each product keeps
 * its exact identity and real-world scale; the model must place each in a distinct, natural spot and never
 * merge, duplicate, or omit any. Reuses the shared scene + shopper-preference facts.
 */
export function buildMultiPlacementTask(input: ComposeInput): string {
  const infos = input.productInfos ?? [];
  const list = infos.map((p, i) => {
    const dims = p.dimensions ? `, real-world size ${describeDimensions(p.dimensions)}` : '';
    const where = p.placementHint ? ` — place ${p.placementHint}` : '';
    return `  ${i + 1}. ${p.name} (category hint: ${p.category}${dims})${where}`;
  });
  return [
    `OPERATION: multi-product composition. Insert ALL ${infos.length} supplied products into the one scene,` +
      ' each at correct real-world scale given its dimensions, with physically correct contact shadows and' +
      " lighting consistent with the scene. Preserve each product's exact identity.",
    'Decide EACH product\'s operation from the product itself, independently:',
    '- a discrete object (e.g. lamp, sofa, mirror, chair) → place it ONCE at a natural, functional location;',
    '- a surfacing/cladding material (e.g. acoustic or slat panels, tiles, wallpaper, flooring, cladding) →' +
      ' CLAD the whole appropriate surface with it, repeating the unit to fill the ENTIRE surface edge-to-edge' +
      ' — never a single piece and never just a small patch on part of the surface.',
    'Give each product exactly ONE coherent treatment, in a DISTINCT place appropriate to its type. Do NOT' +
      ' merge, stack, fuse, duplicate a discrete object, or omit any product — every supplied product must' +
      ' appear. (Repeating a surfacing unit across its surface is the intended cladding, NOT a forbidden' +
      ' duplicate.) Keep the room and the original framing/aspect ratio exactly.',
    '',
    'PRODUCTS (the supplied product images follow the room image, in this order):',
    ...list,
    '',
    'REQUEST DETAILS for this generation:',
    ...sceneFacts(input),
    ...placementReference(input),
    ...customPreference(input),
  ].join('\n');
}

/**
 * `accessory_placement` task (the FASHION / person path): add the supplied accessory to the SUBJECT (the
 * person in the uploaded photo), matching their pose. The HUMAN-SUBJECT anchor REPLACES the scene/exterior
 * anchoring — `sceneFacts()` and the EXTERIOR note are intentionally NOT called here, so no room/door/scene
 * scale reasoning can leak into a portrait. Reuses the product-identity anchor and the subordinated shopper
 * free-text only. Paired with `COMPOSE_SYSTEM_INSTRUCTION_FASHION`.
 */
export function buildAccessoryPlacementTask(input: ComposeInput): string {
  const where = input.placementHint
    ? `place the supplied accessory ${input.placementHint}`
    : "carry the supplied accessory on the subject's existing free arm — hanging from the hand by its" +
      ' handle/strap, or looped over the forearm / in the crook of the elbow as the handle suggests — matching' +
      " the subject's pose";
  const lines: string[] = [
    `OPERATION: accessory placement on a person. Task: ${where}, sized to the subject's hand and forearm` +
      ' (NOT to any room, door, wall, or car), carried by the arm the subject ALREADY has free — NEVER adding a' +
      ' new hand, arm, or finger to hold it — with the existing fingers wrapping OVER the handle where it is' +
      ' gripped (or the forearm passing through the handle where it hangs), a soft contact shadow where the' +
      " accessory meets the body, and lighting matching the existing light on the person. Preserve the" +
      " accessory's exact identity. Preserve the subject — face, hair, body, pose, hands, and clothing — and" +
      ' the entire background and the original framing/aspect ratio exactly. Add ONLY the accessory.',
    '',
    'HUMAN-SUBJECT ANCHOR: the first image is a PERSON, not a room. Size and position the accessory relative' +
      " to the person's hand and forearm; introduce no room or scene scale reasoning.",
    '',
    'REQUEST DETAILS for this generation:',
  ];

  const productDescription = input.productDescription?.trim();
  if (productDescription) {
    lines.push(`- PRODUCT (insert this exact accessory; preserve its identity): ${productDescription}`);
  }
  lines.push(`- Product category (approximate merchant hint, may be inaccurate): ${input.category}.`);
  const dims = input.dimensions ? describeDimensions(input.dimensions) : '';
  if (dims) {
    lines.push(`- Real-world accessory dimensions: ${dims}. Use to keep its size realistic in the hand.`);
  }
  lines.push(...placementReference(input), ...customPreference(input));
  return lines.join('\n');
}
