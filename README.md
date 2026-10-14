# TCC-IA Frontend

Frontend em React + TypeScript + Vite para interagir com o backend FastAPI do projeto TCC-IA.

Este app fornece a interface para:

- enviar os datasets em JSON para o backend;
- validar a estrutura básica dos arquivos no navegador;
- iniciar e acompanhar a geração de artefatos por Job ID;
- consultar execuções antigas por ID;
- baixar o ZIP gerado quando a execução estiver concluída.

## Visão geral

A aplicação foi desenvolvida para suportar o fluxo de geração automática de arquivos a partir de quatro entradas principais:

- requisitos funcionais
- requisitos não funcionais
- regras de negócio
- projetos de interiores

Depois do upload, o frontend exibe o Job ID, monitora o status em tempo real e permite continuar a execução por meio do mesmo identificador.

## Requisitos

- Node.js 20+
- npm
- Backend FastAPI disponível em `http://localhost:8000`
- CORS habilitado para `http://localhost:5173`

## Primeiros passos

No Windows (PowerShell):

```powershell
cd FrontEnd
npm install
Copy-Item .env.example .env
npm run dev
```

Acesse:

```text
http://localhost:5173
```

Se necessário, ajuste o arquivo `.env` com a URL do backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Scripts disponíveis

```powershell
npm run dev
npm run build
npm run preview
```

## Fluxo de uso

1. Selecione os quatro arquivos JSON exigidos.
2. Verifique se o conteúdo é um objeto JSON válido.
3. Faça upload dos datasets para o backend.
4. O sistema retorna o Job ID da execução.
5. O frontend inicia a geração e consulta o status a cada 3 segundos enquanto a tarefa estiver em execução.
6. Quando concluída, o usuário pode baixar o ZIP gerado.
7. Para consultar ou retomar uma execução anterior, informe o Job ID na seção de pesquisa.

## Contratos da API utilizados

Os endpoints abaixo são os que a interface usa e devem existir no backend:

- `GET /api/health` — verifica se a API está disponível.
- `POST /api/datasets/upload` — upload multipart com os campos:
  - `requisitos_funcionais`
  - `requisitos_nao_funcionais`
  - `regras_negocio`
  - `projetos_interiores`
- `POST /api/generation/{job_id}/start` — inicia a geração em segundo plano.
- `GET /api/generation/{job_id}` — consulta status, mensagem, erro e resultado.
- `GET /api/generation/{job_id}/download` — baixa o ZIP da execução concluída.

## Observações importantes

- O frontend valida apenas a sintaxe básica do JSON no navegador.
- A validação estrutural detalhada fica a cargo do backend.
- A interface mostra logs locais e mensagens provenientes da API.
- Se uma execução já estiver concluída, o frontend pode disparar o download automaticamente ao consultar pelo Job ID.
- Se o status for `datasets_uploaded`, o frontend inicia o processamento para o mesmo Job ID.
- Se o status for `running`, o acompanhamento é retomado automaticamente.

## Consulta e continuidade por Job ID

A seção de pesquisa permite:

- localizar uma execução existente pelo ID;
- retomar o acompanhamento quando a geração está em andamento;
- iniciar a geração automaticamente quando os datasets já foram recebidos;
- baixar o ZIP quando a execução estiver concluída.

A retomada exata após falha depende de persistência de checkpoints no backend. Mais detalhes estão no arquivo `README_RESUME_JOB.md`.

## Build para produção

```powershell
npm run build
```

O build gera a versão otimizada do frontend para deploy estático, pronta para ser servida por um provedor ou por um servidor de arquivos.

## Estrutura principal

```text
FrontEnd/
├── src/
├── .env.example
├── index.html
├── package.json
├── README.md
├── README_RESUME_JOB.md
└── vite.config.*
```

## Troubleshooting

- Se a aplicação não conectar com o backend, confirme se a API está no ar em `http://localhost:8000`.
- Verifique se `VITE_API_BASE_URL` aponta para a porta correta.
- Confirme que o backend aceita requisições vindas de `http://localhost:5173`.
- Se o download do ZIP não funcionar, confirme se o endpoint `/api/generation/{job_id}/download` foi implementado no backend.
