import type { AIProvider, ComposeInput, ProviderResult } from '../types.js';

/** Replicate provider stub — documented fallback behind the same interface (architecture §2, §7.2). */
export class ReplicateProvider implements AIProvider {
  readonly name = 'replicate';

  async compose(_input: ComposeInput, _prompt: string): Promise<ProviderResult> {
    throw new Error('ReplicateProvider is not implemented yet (documented fallback)');
  }
}
