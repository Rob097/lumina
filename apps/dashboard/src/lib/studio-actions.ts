'use server';

import type { ClientInput, StudioGenerateRequest } from '@lumina/shared';
import {
  createClient,
  createStudioGeneration,
  emailGenerationResult,
  fetchGeneration,
  signStudioUpload,
} from '@/lib/api';

/** Studio (#8) server actions — thin wrappers so the client component never talks to the API directly. */

export async function createStudioClientAction(input: ClientInput) {
  return createClient(input);
}

export async function signStudioUploadAction(contentType: string) {
  return signStudioUpload(contentType);
}

export async function startStudioGenerationAction(input: StudioGenerateRequest) {
  return createStudioGeneration(input);
}

/** Poll a generation's terminal state for the Studio result view. */
export async function pollStudioGenerationAction(id: string) {
  const detail = await fetchGeneration(id);
  if (!detail) {
    return null;
  }
  return { status: detail.status, resultUrl: detail.resultUrl, roomUrl: detail.roomUrl };
}

export async function emailStudioResultAction(id: string, email?: string) {
  return emailGenerationResult(id, email);
}
