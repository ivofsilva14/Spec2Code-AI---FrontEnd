import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, checkApiHealth, downloadGenerationZip, getGenerationStatus, startGeneration, uploadDatasets } from './api';
import type { DatasetKey, GenerationStatus, GenerationStatusResponse, UploadResponse } from './types';

const DATASETS: { key: DatasetKey; title: string; description: string; filename: string }[] = [
  { key: 'requisitos_funcionais', title: 'Requisitos funcionais', description: 'Funcionalidades esperadas do sistema.', filename: 'requisitos_funcionais.json' },
  { key: 'requisitos_nao_funcionais', title: 'Requisitos não funcionais', description: 'Qualidade, segurança e restrições.', filename: 'requisitos_nao_funcionais.json' },
  { key: 'regras_negocio', title: 'Regras de negócio', description: 'Regras e condições operacionais.', filename: 'regras_negocio.json' },
  { key: 'projetos_interiores', title: 'Projetos de interiores', description: 'Projetos que orientam a solução de marcenaria.', filename: 'projetos_interiores.json' },
];

type LogEntry = { time: string; level: 'info' | 'success' | 'error'; text: string };
const terminalTime = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const STATUS_LABELS: Record<GenerationStatus, string> = {
  datasets_uploaded: 'Arquivos recebidos', running: 'Em execução', completed: 'Concluído', failed: 'Falhou',
};

export default function App() {
  const [files, setFiles] = useState<Partial<Record<DatasetKey, File>>>({});
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [checkingApi, setCheckingApi] = useState(false);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [job, setJob] = useState<GenerationStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchJobId, setSearchJobId] = useState('');
  const [searchedJob, setSearchedJob] = useState<GenerationStatusResponse | null>(null);
  const [searchingJob, setSearchingJob] = useState(false);
  const [downloadingJob, setDownloadingJob] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [copiedJobId, setCopiedJobId] = useState(false);

  const addLog = useCallback((text: string, level: LogEntry['level'] = 'info') => {
    setLogs((old) => [{ time: terminalTime(), level, text }, ...old].slice(0, 80));
  }, []);

  const checkConnection = useCallback(async () => {
    setCheckingApi(true);
    try {
      const ok = await checkApiHealth();
      setApiOnline(ok);
      addLog(ok ? 'API FastAPI respondeu ao health check.' : 'A API respondeu, mas o status de saúde não foi reconhecido.', ok ? 'success' : 'error');
    } catch (e) {
      setApiOnline(false);
      addLog(`Não foi possível conectar à API: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
    } finally { setCheckingApi(false); }
  }, [addLog]);

  useEffect(() => { void checkConnection(); }, [checkConnection]);

  useEffect(() => {
    if (!job?.job_id || job.status !== 'running') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getGenerationStatus(job.job_id);
        if (cancelled) return;
        setJob((previous) => {
          if (!previous || previous.status !== next.status || previous.message !== next.message || previous.error !== next.error) {
            addLog(next.error ? `Erro informado pela API: ${next.error}` : next.message || `Status atualizado: ${next.status}`, next.status === 'failed' ? 'error' : next.status === 'completed' ? 'success' : 'info');
          }
          return next;
        });
        if (next.status === 'running') timer = setTimeout(poll, 3000);
      } catch (e) {
        if (!cancelled) {
          addLog(`Falha ao consultar status: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [job?.job_id, job?.status, addLog]);


  const searchExistingJob = async () => {
    const jobId = searchJobId.trim();
    if (!jobId) { setSearchError('Informe o Job ID para pesquisar.'); return; }
    setSearchingJob(true); setSearchError(''); setDownloadMessage(''); setSearchedJob(null);
    try {
      let result = await getGenerationStatus(jobId);
      setSearchedJob(result);
      setJob(result);
      addLog(`Execução consultada pelo Job ID: ${jobId} — status ${result.status}.`, result.status === 'completed' ? 'success' : 'info');

      // Se os datasets já foram recebidos, mas a geração ainda não começou,
      // retoma o fluxo iniciando o processamento desse mesmo Job ID.
      if (result.status === 'datasets_uploaded') {
        result = await startGeneration(jobId);
        setSearchedJob(result);
        setJob(result);
        addLog(result.message || `Processamento iniciado para ${jobId}.`, 'success');
        return;
      }

      // Ao localizar uma execução concluída, inicia o download automaticamente.
      if (result.status === 'completed') {
        setDownloadingJob(true);
        try {
          await downloadGenerationZip(jobId);
          setDownloadMessage('A execução já estava concluída. O download do ZIP foi iniciado.');
          addLog(`Execução ${jobId} concluída; download automático solicitado.`, 'success');
        } finally {
          setDownloadingJob(false);
        }
      } else if (result.status === 'running') {
        addLog(`Acompanhamento retomado para ${jobId}; o status será atualizado automaticamente.`, 'success');
      } else if (result.status === 'failed') {
        setSearchError('Esta execução falhou. O backend atual não salva checkpoints recuperáveis; para continuar exatamente da etapa interrompida, é necessário implementar persistência de checkpoint no pipeline.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível consultar essa execução.';
      setSearchError(message);
      addLog(`Consulta do Job ID ${jobId} falhou: ${message}`, 'error');
    } finally { setSearchingJob(false); }
  };

  const downloadSearchedJob = async () => {
    if (!searchedJob || searchedJob.status !== 'completed') return;
    setDownloadingJob(true); setSearchError(''); setDownloadMessage('');
    try {
      await downloadGenerationZip(searchedJob.job_id);
      setDownloadMessage('Download solicitado. Confira os downloads do navegador.');
      addLog(`Download ZIP solicitado para o Job ID ${searchedJob.job_id}.`, 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível baixar os artefatos.';
      setSearchError(message);
      addLog(`Falha no download do Job ID ${searchedJob.job_id}: ${message}`, 'error');
    } finally { setDownloadingJob(false); }
  };

  const selectedCount = useMemo(() => DATASETS.filter((item) => files[item.key]).length, [files]);
  const allSelected = selectedCount === DATASETS.length;

  const chooseFile = async (key: DatasetKey, file?: File) => {
    if (!file) return;
    setError('');
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError(`O arquivo de ${DATASETS.find((item) => item.key === key)?.title.toLowerCase()} deve ter extensão .json.`);
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('O conteúdo JSON deve ser um objeto.');
      setFiles((old) => ({ ...old, [key]: file }));
      setUpload(null); setJob(null);
      addLog(`Arquivo selecionado: ${file.name} (${formatBytes(file.size)}).`);
    } catch (e) {
      setError(`JSON inválido em ${file.name}: ${e instanceof Error ? e.message : 'conteúdo inválido'}`);
    }
  };

  const beginGeneration = async () => {
    if (!allSelected) return;
    setBusy(true); setError(''); setUpload(null); setJob(null);
    try {
      const payload = Object.fromEntries(DATASETS.map(({ key }) => [key, files[key]!])) as Record<DatasetKey, File>;
      addLog('Enviando os quatro datasets para validação no backend.');
      const uploaded = await uploadDatasets(payload);
      setUpload(uploaded);
      setSearchJobId(uploaded.job_id);
      setCopiedJobId(false);
      addLog(`Datasets validados e armazenados localmente. Execução: ${uploaded.job_id}`, 'success');
      const started = await startGeneration(uploaded.job_id);
      setJob(started);
      addLog(started.message || 'Geração iniciada.', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro inesperado.';
      setError(message); addLog(message, 'error');
    } finally { setBusy(false); }
  };

  const reset = () => { setFiles({}); setUpload(null); setJob(null); setError(''); setLogs([]); addLog('Pronto para uma nova execução.'); };
  const status = job?.status || (upload ? 'datasets_uploaded' : null);
  const progress = status === 'completed' ? 100 : status === 'running' ? 65 : status === 'datasets_uploaded' ? 25 : 0;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TCC-IA</strong><span>GERADOR MULTIAGENTE</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <div className="nav-item active"><span className="nav-icon">▦</span> Visão geral</div>
      <div className="sidebar-bottom"><div className="connection"><span className={`dot ${apiOnline ? 'green' : apiOnline === false ? 'red' : 'amber'}`} />{apiOnline ? 'Conectado' : apiOnline === false ? 'Desconectado' : 'Verificando...'}</div><code>{API_BASE_URL}</code><button className="link-button" onClick={() => void checkConnection()} disabled={checkingApi}>{checkingApi ? 'Verificando...' : 'Testar conexão ↗'}</button></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div><h1>Gerador de sistemas</h1></div><div className="topbar-right"><span className="local-badge"><span className="dot green" /> Processamento local</span><div className="avatar">AI</div></div></header>
      <section className="welcome"><div><div className="eyebrow light">TCC · INTELIGÊNCIA ARTIFICIAL GENERATIVA</div><h2>Transforme requisitos em software.</h2><p>Envie os datasets do projeto de marcenaria e acompanhe o pipeline multiagente.</p></div><div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="core">✳</div><span className="node node-a">AI</span><span className="node node-b">{ }</span><span className="node node-c">✓</span></div></section>

      <section className="panel job-search-panel">
        <div className="panel-heading"><div><div className="section-kicker">ARTEFATOS EXISTENTES</div><h3>Pesquisar execução por Job ID</h3><p>Informe um Job ID para retomar o acompanhamento, iniciar uma execução ainda não iniciada ou baixar automaticamente o ZIP se ela já estiver concluída.</p></div></div>
        <form className="job-search-form" onSubmit={(event) => { event.preventDefault(); void searchExistingJob(); }}>
          <label className="job-id-field"><span>Job ID</span><input value={searchJobId} onChange={(event) => setSearchJobId(event.target.value)} placeholder="Cole o Job ID da geração" autoComplete="off" /></label>
          <button className="primary-button search-button" type="submit" disabled={searchingJob || !searchJobId.trim()}>{searchingJob ? <><span className="spinner"/> Consultando...</> : <>Continuar / consultar <span>↗</span></>}</button>
        </form>
        {searchError && <div className="alert error-alert"><strong>Não foi possível concluir</strong><span>{searchError}</span></div>}
        {searchedJob && <div className="searched-job-result">
          <div className="searched-job-heading"><div><span className="searched-job-label">JOB ID</span><code>{searchedJob.job_id}</code></div><span className={`status-pill ${searchedJob.status}`}><span className="dot"/>{STATUS_LABELS[searchedJob.status]}</span></div>
          <p>{searchedJob.message || searchedJob.error || 'Status consultado no backend.'}</p>
          {searchedJob.error && <div className="searched-job-error">{searchedJob.error}</div>}
          <div className="searched-job-actions"><button className="download-button active-download" onClick={() => void downloadSearchedJob()} disabled={searchedJob.status !== 'completed' || downloadingJob}>{downloadingJob ? <><span className="spinner dark"/> Preparando ZIP...</> : searchedJob.status === 'completed' ? <>Baixar arquivos ZIP <span>↓</span></> : 'Disponível após concluir'}</button><span className="searched-job-hint">{searchedJob.status === 'completed' ? 'Download automático solicitado; se necessário, você pode baixar novamente.' : searchedJob.status === 'running' ? 'Acompanhamento conectado; o status será atualizado automaticamente.' : searchedJob.status === 'datasets_uploaded' ? 'A geração será iniciada para este Job ID.' : 'Execução com falha; retomada exata exige checkpoints persistidos pelo backend.'}</span></div>
          {downloadMessage && <div className="download-success">{downloadMessage}</div>}
        </div>}
      </section>

      {upload?.job_id && <section className="panel created-job-panel" aria-live="polite">
        <div className="created-job-icon">✓</div>
        <div className="created-job-content">
          <span className="section-kicker">EXECUÇÃO REGISTRADA</span>
          <h3>Guarde o Job ID para consultar esta geração depois</h3>
          <p>Use este identificador na seção “Pesquisar execução por Job ID”. Ele já foi preenchido automaticamente para você.</p>
          <div className="created-job-id"><code>{upload.job_id}</code><button className="secondary-button" type="button" onClick={() => { void navigator.clipboard.writeText(upload.job_id).then(() => { setCopiedJobId(true); addLog('Job ID copiado para a área de transferência.', 'success'); }).catch(() => { setCopiedJobId(false); setError('Não foi possível copiar automaticamente. Selecione e copie o Job ID manualmente.'); }); }}>{copiedJobId ? 'Copiado ✓' : 'Copiar Job ID'}</button></div>
        </div>
      </section>}

      <section className="metrics-grid">
        <article className="metric-card"><div className="metric-icon violet">⌁</div><div className="metric-label">DATASETS SELECIONADOS</div><div className="metric-value">{selectedCount}<span> / 4</span></div><div className="metric-foot">Arquivos JSON obrigatórios</div></article>
        <article className="metric-card"><div className="metric-icon blue">◷</div><div className="metric-label">STATUS DA GERAÇÃO</div><div className="metric-value small">{status ? STATUS_LABELS[status] : 'Aguardando'}</div><div className="metric-foot">{job?.job_id ? `ID: ${job.job_id.slice(0, 12)}…` : 'Nenhuma execução iniciada'}</div></article>
        <article className="metric-card"><div className="metric-icon green">⌗</div><div className="metric-label">ETAPAS DO PIPELINE</div><div className="metric-value">{job?.result?.cells_executed?.length ?? '—'}</div><div className="metric-foot">Células reportadas pelo resultado final</div></article>
      </section>

      <div className="content-grid">
        <section className="panel datasets-panel">
          <div className="panel-heading"><div><div className="section-kicker">ETAPA 01</div><h3>Datasets de entrada</h3><p>Selecione os quatro arquivos JSON para iniciar.</p></div><span className="count-pill">{selectedCount}/4 arquivos</span></div>
          <div className="dataset-list">{DATASETS.map((item, index) => {
            const file = files[item.key];
            return <label className={`dataset-row ${file ? 'selected' : ''}`} key={item.key}>
              <input type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(item.key, event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <div className={`file-icon file-${index}`}>{file ? '✓' : '{ }'}</div>
              <div className="dataset-info"><strong>{item.title}</strong><span>{file ? file.name : item.filename}</span><small>{file ? formatBytes(file.size) : item.description}</small></div>
              <div className={`file-state ${file ? 'ok' : ''}`}>{file ? 'Selecionado' : 'Selecionar'} <span>{file ? '✓' : '＋'}</span></div>
            </label>;
          })}</div>
          <div className="upload-note"><span className="info-icon">i</span><span>Os arquivos são validados e armazenados localmente pelo backend. Cada arquivo deve ser um objeto JSON válido.</span></div>
          {error && <div className="alert error-alert"><strong>Não foi possível continuar</strong><span>{error}</span></div>}
          <div className="primary-actions"><button className="primary-button" disabled={!allSelected || busy || job?.status === 'running' || apiOnline === false} onClick={() => void beginGeneration()}>{busy ? <><span className="spinner"/> Enviando datasets...</> : job?.status === 'running' ? <><span className="spinner"/> Geração em andamento</> : <>{upload ? 'Iniciar novamente' : 'Validar e iniciar geração'} <span>→</span></>}</button><button className="secondary-button" onClick={reset} disabled={busy || job?.status === 'running'}>Limpar</button></div>
          {!allSelected && <div className="helper-text">Selecione os {4 - selectedCount} arquivo(s) restante(s) para continuar.</div>}
        </section>

        <section className="panel progress-panel">
          <div className="panel-heading"><div><div className="section-kicker">ETAPA 02</div><h3>Execução multiagente</h3><p>Acompanhamento do processamento no backend.</p></div><span className={`status-pill ${status || 'idle'}`}><span className="dot" />{status ? STATUS_LABELS[status] : 'Aguardando'}</span></div>
          <div className="progress-summary"><div><span>Progresso estimado</span><strong>{progress}%</strong></div><div className="progress-track"><div className={`progress-fill ${status === 'failed' ? 'failed' : ''}`} style={{ width: `${progress}%` }}/></div><small>{job?.message || upload?.message || 'A execução aparecerá aqui após o envio dos datasets.'}</small></div>
          <div className="pipeline-steps">{[
            { label: 'Validação dos datasets', detail: upload ? 'Concluída pelo backend' : 'Aguardando arquivos', done: !!upload },
            { label: 'Orquestração dos agentes', detail: job?.status === 'running' ? 'Processamento em andamento' : job?.status === 'completed' ? 'Concluída' : 'Aguardando início', done: job?.status === 'completed', active: job?.status === 'running' },
            { label: 'Artefatos do sistema', detail: job?.status === 'completed' ? 'Saída reportada pelo backend' : 'Disponível após a conclusão', done: job?.status === 'completed' },
          ].map((step, i) => <div className="pipeline-step" key={step.label}><div className={`step-marker ${step.done ? 'done' : step.active ? 'active' : ''}`}>{step.done ? '✓' : step.active ? <span className="spinner dark"/> : i + 1}</div><div className="step-text"><strong>{step.label}</strong><span>{step.detail}</span></div></div>)}</div>
          {job?.status === 'failed' && <div className="alert error-alert"><strong>Geração falhou</strong><span>{job.error || job.message || 'O backend não retornou detalhes do erro.'}</span></div>}
          {job?.status === 'completed' && <div className="result-card"><div className="result-icon">✓</div><div><strong>Geração concluída</strong><span>{job.result?.projeto_id ? `Projeto: ${job.result.projeto_id}` : 'O backend confirmou a conclusão.'}</span>{job.result?.output_dir && <code>{job.result.output_dir}</code>}</div></div>}
          <div className="download-card"><div className="download-symbol">↓</div><div className="download-copy"><strong>Download dos artefatos</strong><span>Use a pesquisa por Job ID acima para localizar uma execução concluída e baixar seus artefatos.</span></div><button className="download-button" onClick={() => { document.querySelector<HTMLInputElement>('.job-id-field input')?.focus(); }} title="Pesquise um Job ID na seção acima">Pesquisar Job ID <span>↗</span></button></div>
        </section>
      </div>

      <section className="panel logs-panel"><div className="panel-heading logs-heading"><div><div className="section-kicker">MONITORAMENTO</div><h3>Eventos e mensagens</h3><p>Histórico capturado pelo frontend e mensagens retornadas pela API. Não representa logs internos do processo.</p></div><span className="logs-count">{logs.length} eventos</span></div><div className="terminal"><div className="terminal-bar"><div className="terminal-dots"><i/><i/><i/></div><span>tcc-ia · console de execução</span><span className="terminal-live"><span className="dot green"/> AO VIVO</span></div><div className="terminal-body">{logs.length === 0 ? <div className="empty-log">Nenhum evento ainda. Selecione os datasets para começar.</div> : logs.map((log, i) => <div className="log-line" key={`${log.time}-${i}`}><time>{log.time}</time><span className={`log-level ${log.level}`}>{log.level.toUpperCase()}</span><span>{log.text}</span></div>)}</div></div></section>
      <footer><span>TCC-IA · Gerador de sistemas multiagente</span><span>Frontend local · React + TypeScript + Vite</span></footer>
    </main>
  </div>;
}
