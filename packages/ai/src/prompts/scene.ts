/**
 * SCENE — the per-image analysis prompt (editable).
 *
 * A single cheap vision pass that reads the room/scene photo and returns **continuous facts about that
 * specific image** (light, surfaces, tilt, scale, a placement region, quality flags) — never a product
 * category. The schema + parsing live in `@lumina/shared` (`SceneAnalysisSchema`); only the prompt text
 * lives here so it sits next to the other editable prompts. Output is consumed best-effort: a low
 * `confidence` is honoured by the caller, which falls back to composing without these facts.
 */
export function buildScenePrompt(): string {
  return [
    'You are a vision analyst preparing a product-visualization composite. Look ONLY at the photo and',
    'report measurable facts about THIS image. Do not describe or guess any product — only the scene.',
    'Return a strict JSON object with these fields:',
    '- isExterior: true if this is an outdoor scene (facade, entrance, garden, terrace), false if indoors.',
    '- lighting: { direction (one of top, top-left, top-right, left, right, front, ambient, unknown),',
    '  temperatureK (approximate Kelvin, omit if unsure), intensity (low | medium | high) }.',
    '- surfaces: array of the usable surfaces, each { kind (floor | wall | ceiling | table | ground |',
    '  other), orientation (short free-text note, optional) }.',
    '- tiltDegrees: the signed horizon/vertical tilt of the camera in degrees (0 if level; positive when',
    '  the horizon rises to the right). Estimate honestly — it is used to straighten the photo.',
    '- roomScale: { ceilingHeightM (optional), referenceObjects (recognisable items that give real-world',
    '  scale, optional) } — omit fields you cannot judge.',
    '- suggestedPlacement: { region (short free-text describing the most natural place for a product),',
    '  bbox ([x0,y0,x1,y1] normalised 0..1, top-left origin, optional) } — omit if unclear.',
    '- quality: { blurry, dark, cluttered } booleans describing how hard this photo is to work with.',
    '- confidence: 0..1 — how sure you are overall; lower it when the photo is unclear or ambiguous.',
  ].join('\n');
}
