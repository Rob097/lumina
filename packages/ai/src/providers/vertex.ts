import type { AIProvider, ComposeInput, ProviderResult } from '../types.js';

/** Vertex AI provider stub — documented fallback behind the same interface (architecture §2, §7.2). */
export class VertexProvider implements AIProvider {
  readonly name = 'vertex';

  async compose(_input: ComposeInput, _prompt: string): Promise<ProviderResult> {
    throw new Error('VertexProvider is not implemented yet (documented fallback)');
  }
}
