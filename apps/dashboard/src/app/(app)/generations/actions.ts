'use server';

import type { GenerationDetail, GenerationsListResponse } from '@lumina/shared';
import { fetchGeneration, fetchGenerations } from '@/lib/api';

/** Fetch a page of generations (used for filter changes + "Load more"). */
export async function loadGenerationsAction(params: {
  status?: string;
  cursor?: string;
}): Promise<GenerationsListResponse> {
  return fetchGenerations(params);
}

export async function getGenerationDetailAction(id: string): Promise<GenerationDetail | null> {
  return fetchGeneration(id);
}
