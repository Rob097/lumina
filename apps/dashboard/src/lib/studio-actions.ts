'use server';

import type { ClientInput, ClientUpdate, StudioGenerateRequest } from '@lumina/shared';
import {
  createClient,
  createStudioGeneration,
  deleteClient,
  emailGenerationResult,
  fetchGeneration,
  fetchGenerations,
  signStudioUpload,
  updateClient,
} from '@/lib/api';

/** Studio (#8) server actions — thin wrappers so the client component never talks to the API directly. */

export async function createStudioClientAction(input: ClientInput) {
  return createClient(input);
}

export async function updateStudioClientAction(id: string, patch: ClientUpdate) {
  return updateClient(id, patch);
}

export async function deleteStudioClientAction(id: string) {
  return deleteClient(id);
}

/** A page of a single client's renders (newest-first), for the client detail gallery. */
export async function loadClientGenerationsAction(clientId: string, cursor?: string) {
  return fetchGenerations({ clientId, ...(cursor ? { cursor } : {}), limit: '12' });
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
