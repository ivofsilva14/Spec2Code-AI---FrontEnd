import type { DatasetKey, GenerationStatusResponse, UploadResponse } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  return body?.detail || `A API respondeu com HTTP ${response.status}.`;
}

export async function checkApiHealth(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as { status?: string };
  return body.status === 'ok';
}

export async function uploadDatasets(files: Record<DatasetKey, File>): Promise<UploadResponse> {
  const form = new FormData();
  (Object.keys(files) as DatasetKey[]).forEach((key) => form.append(key, files[key]));
  const response = await fetch(`${API_BASE_URL}/api/datasets/upload`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<UploadResponse>;
}

export async function startGeneration(jobId: string): Promise<GenerationStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/generation/${encodeURIComponent(jobId)}/start`, { method: 'POST' });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<GenerationStatusResponse>;
}

export async function getGenerationStatus(jobId: string): Promise<GenerationStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/generation/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<GenerationStatusResponse>;
}

export { API_BASE_URL };


/** Baixa os artefatos de uma execução concluída e aciona o salvamento no navegador. */
export async function downloadGenerationZip(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/generation/${encodeURIComponent(jobId)}/download`);
  if (!response.ok) throw new Error(await readError(response));

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `tcc_ia_${jobId}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
