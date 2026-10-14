export type DatasetKey =
  | 'requisitos_funcionais'
  | 'requisitos_nao_funcionais'
  | 'regras_negocio'
  | 'projetos_interiores';

export type GenerationStatus = 'datasets_uploaded' | 'running' | 'completed' | 'failed';

export interface UploadedDataset {
  filename: string;
  size_bytes: number;
}

export interface UploadResponse {
  job_id: string;
  status: 'datasets_uploaded';
  storage: 'local';
  datasets_path: string;
  files: Record<DatasetKey, UploadedDataset>;
  message: string;
}

export interface GenerationStatusResponse {
  job_id: string;
  status: GenerationStatus;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string;
  output_dir?: string;
  result?: { projeto_id?: string; output_dir?: string; cells_executed?: number[] } | null;
  error?: string | null;
}

export interface ApiErrorPayload { detail?: string }
