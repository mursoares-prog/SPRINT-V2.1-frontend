# SPRINT ABAN — Frontend

Aplicação **React + TypeScript + Vite** do SPRINT ABAN: assistente de entrada, geração e
refino do cronograma de abandono, e editores administrativos de lógica e da base de pacotes.

> Contexto geral do sistema (frontend + backend) em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
> O **backend** vive em um repositório separado:
> [SPRINT-V2.1-backend](https://github.com/mursoares-prog/SPRINT-V2.1-backtend).

## Stack

- **React 19** + **TypeScript** (build por `tsc -b` + **Vite 8**)
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **@xyflow/react** (ReactFlow) — editor visual de fluxogramas de decisão
- **lucide-react** / **react-icons** — ícones

## Rodar

Requer **Node 20+**.

```bash
npm install
cp .env.example .env      # VITE_API_URL = URL do backend
npm run dev               # http://localhost:5173
```

| Script | O que faz |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento (Vite, HMR) |
| `npm run build` | Type-check (`tsc -b`) **+** build de produção (`vite build`) → `dist/` |
| `npm run preview` | Serve o `dist/` já buildado |
| `npm run lint` | ESLint |

`npm run build` é também o **type-check autoritativo**: deve terminar **sem erros**.

## Variáveis de ambiente

| Var | Efeito |
|-----|--------|
| `VITE_API_URL` | URL base do backend. **Se vazia**, o app opera 100% local (sem persistência no servidor) e cai no login legado offline. |

## Estrutura (`src/`)

```
src/
├── main.tsx / App.tsx        # Bootstrap e casca do app (navegação entre views)
├── context/
│   └── AppContext.tsx        # Estado global (inputs, schedule, refino) + ações
├── components/               # UI (ver abaixo)
├── engines/                  # Lógica pura de geração do cronograma
├── data/                     # Dados de domínio (sequências, pacotes, escopos, lógica)
├── utils/                    # API, auth, arquivos de projeto, helpers
└── types/index.ts            # Tipos de domínio compartilhados
```

### Views (fluxo do usuário)

O app navega entre 4 views (`AppState.view`): `home` → `wizard` (assistente) →
`schedule` (cronograma gerado) → `fine_tuning` (refino manual).

### `engines/` — geração do cronograma (lógica pura, sem React)

| Arquivo | Responsabilidade |
|---------|------------------|
| `scheduleRouter.ts` | **Ponto de entrada:** `generateSchedule(inputs)` → escolhe a fonte da lógica do escopo (override do backend → estática) e delega ao `logicEngine`. |
| `logicEngine.ts` | Interpretador das **árvores de decisão**: `generateScheduleFromLogic()` → lista de pacotes por fase. |
| `sequenceEngine.ts` | Helpers de transição compartilhados (`applyTransitions`, `applyTimeline`, `normalizeScopePhases`) usados pelo `logicEngine`. |
| `nippleDepth.ts` | Cálculo de profundidade de nipples/BHA. |
| `placeholders.ts` | Resolução de tokens `{{campo=glifo}}` nos textos das linhas. |

> A geração roda **100% no frontend**, pela engine de árvores de decisão. O backend não gera
> cronograma — ver [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

### `components/` — principais

| Componente | Papel |
|------------|-------|
| `Sidebar.tsx` | Navegação/etapas |
| `LoginModal.tsx` | Autenticação (backend ou login legado offline) |
| `InputSummaryPanel.tsx` / `ProjectDataPanel.tsx` | Assistente e dados do projeto |
| `ScheduleView.tsx` | Cronograma gerado (lista/Gantt) |
| `FineTuningView.tsx` | Refino manual do cronograma |
| `AdminView.tsx` / `AdminVarsEditor.tsx` | Administração da base de pacotes e variáveis |
| `LogicEditorPanel.tsx` / `LogicFlowEditor.tsx` / `LogicGraphPanel.tsx` / `LogicQuestionsPanel.tsx` | Edição das árvores de decisão (lógica) — clássico (SVG) e visual (ReactFlow) |
| `PackagesCatalogModal.tsx` | Catálogo de pacotes |

### `data/` — dados de domínio

Sequências (`sequences.ts`), pacotes (`packages.ts`, `packageLines.json`), escopos e rótulos
(`scopeCategories.ts`, `scopeLabels.ts`), árvores de lógica (`logicSecs.ts`,
`logicScopesBundle.json`), ontologia (`owOntology.json`) e *stores* de override que mesclam
os dados base com edições vindas do backend.

### `utils/`

`api.ts` (cliente HTTP do backend), `auth.ts` (sessão/token e login legado), `projectFile.ts`
/ `projectFacts.ts` (serialização de projetos), `defaultInputs.ts`.

## Documentação relacionada

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura geral, domínio e a engine de
  árvores de decisão.
- Backend (repo separado): [SPRINT-V2.1-backend](https://github.com/mursoares-prog/SPRINT-V2.1-backtend).
