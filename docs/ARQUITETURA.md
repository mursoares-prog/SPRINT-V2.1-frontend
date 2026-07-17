# Arquitetura — SPRINT ABAN v2.1

Documento de referência para uma equipe que assume o código. Cobre o domínio, o design da
engine de geração (árvores de decisão), o mapa de módulos de cada metade e as restrições
para produção.

---

## 1. O que o sistema faz

O SPRINT ABAN gera **cronogramas de abandono de poços**. O usuário responde a um assistente
(escopo da operação, tipo de sonda, tecnologia, percentil de duração) e o sistema produz uma
lista ordenada de **pacotes ABAN** distribuídos em **fases** (Fase 0, 1A, 1B, 2, extras,
mobilização/desmobilização), com durações e possibilidade de refino manual antes de salvar.

Conceitos de domínio:

| Termo | Significado |
|-------|-------------|
| **Pacote (ABAN nnn)** | Unidade de trabalho do cronograma (uma ou mais linhas de operação). |
| **Escopo** (`scopeId`) | Tipo de operação de abandono. Seleciona a sequência de pacotes. |
| **Sonda** (`RigType`) | **Molhada:** `ANC` (ancorada), `DP` (dynamic positioning). **Seca:** `PA`, `SPH`, `SM`, `SPM`, `Rigless`. Ver a nota abaixo — só as sondas de molhada passam pela engine de geração. |
| **Tecnologia** | `wireline`, `ct`, `electric`, `workstring`, `bop`, `none`. |
| **Fase** | Agrupamento temporal dos pacotes no cronograma. |
| **Percentil** | Cenário de duração (ex.: P75) usado para estimar tempos. |
| **Linha** | Texto operacional de um pacote, com tokens `{{campo=glifo}}` resolvidos por dados do projeto. |

### Completação molhada vs. seca (importante)

O tipo de poço (`tipoPoco`) é **molhada** ou **seca**, e isso determina o tipo de sonda:

- **Molhada:** sondas `ANC` e `DP`. **É o único caminho que gera cronograma pela engine.**
- **Seca:** sondas `PA`, `SPH`, `SM`, `SPM`, `Rigless`. Fluxo de entrada de dados, mas **não
  aciona a engine de geração** na versão atual.

A geração é **travada para molhada + (ANC ou DP)** em dois pontos de `App.tsx`:
`canGenerate` (`isMolhada && (rigType === 'ANC' || 'DP')`) e o *early-return* de
`handleGenerate`. Consequência prática: nas funções internas da engine, o teste
`rigType === 'ANC' ? … : DP` só recebe **ANC ou DP** — as sondas de seca nunca chegam lá.

> **Nota de domínio / possível evolução:** `PA` (e outras) podem, no domínio real, operar
> também em abandono de completação molhada (ex.: no Nordeste). Hoje a UI não oferece essas
> sondas no caminho de geração (molhada) — só `ANC`/`DP`. Suportar geração para elas é uma
> **decisão de produto** que exige a especificação da sequência/cronograma correspondente.

---

## 2. A engine de geração (árvores de decisão)

O cronograma é gerado **inteiramente no frontend**, por uma engine **dirigida por dados**:
árvores de decisão editáveis ("escopos de lógica"). Administradores modelam novos fluxos
**sem alterar código**.

Componentes:

- **Roteador:** `abandono-app/src/engines/scheduleRouter.ts` → `generateSchedule(inputs)`.
  Escolhe a fonte da lógica do escopo: override salvo no backend → definição estática
  (`LOGIC_BY_SCOPE`). É o **único** ponto de entrada da geração.
- **Interpretador:** `abandono-app/src/engines/logicEngine.ts` →
  `generateScheduleFromLogic(inputs, sections, …)`. Percorre as decisões/respostas e emite
  os pacotes.
- **Camada de transições:** `abandono-app/src/engines/sequenceEngine.ts` exporta os helpers
  `applyTransitions`, `applyTimeline` e `normalizeScopePhases`, usados pelo interpretador
  para reconstruir montagens/desmontagens de equipamento de pressão, calcular
  `startDay`/`endDay` e normalizar as fases. (Este arquivo era a antiga engine estática;
  hoje **só** contém esses utilitários compartilhados.)

Onde ficam os dados da lógica:

- Árvores base (em código): `abandono-app/src/data/logicSecs.ts` (`LOGIC_BY_SCOPE`).
- `logicScopesBundle.json`: **snapshot** dessas árvores usado pelo frontend.
- Edições/versionamento de escopos: persistidos no backend (`logic_scope_overrides`, tabela
  versionada) via `/api/logic/*`. O backend **armazena e versiona** as árvores, mas **não
  gera** cronograma.

> **Não há mais engine "espelho" em Python nem contrato de paridade.** A engine estática
> antiga (que tinha o gêmeo `sequence_engine.py` no backend, mantidos em paridade por
> fixtures) foi removida. Ver a nota de roadmap na seção 7.

---

## 3. Fluxo de dados ponta a ponta

```
Usuário → Assistente (WizardPanel)
        → inputs (WizardInputs)
        → scheduleRouter.generateSchedule(inputs)       [TS, árvores de decisão]
        → ScheduleView (cronograma)  ─┐
        → FineTuningView (refino)     │
        → salvar projeto ─────────────┘
                │  POST/PUT /api/projects  (documento JSON completo)
                ▼
          Backend persiste (models.Project, coluna JSON) e devolve o projeto salvo
```

Persistência: cada projeto é um **documento JSON** (`ProjectFile`) numa coluna. Não há
esquema relacional por campo — o backend guarda o documento como está.

---

## 4. Mapa do backend (`backend/app/`)

| Módulo | Responsabilidade |
|--------|------------------|
| `main.py` | App FastAPI, CORS, micro-migrações idempotentes (`ADD COLUMN`), registro dos routers. |
| `config.py` | Env (`DATABASE_URL`, `CORS_ORIGINS`). |
| `database.py` | Engine/sessão SQLAlchemy. |
| `models.py` / `schemas.py` | Modelo `Project` (documento JSON) e DTOs Pydantic. |
| `auth.py` | PBKDF2-SHA256 + token HMAC (sem dependências externas). |
| `base_data.py` | Mescla a base de linhas (bundle + overrides) e valida tokens. |
| `engines/placeholders.py` | Resolução de tokens `{{campo=glifo}}` (usada por `base_data.py`). |
| `engines/nipple_depth.py` | Cálculo de profundidade de nipples. Testado (`test_nipple_depth.py`), mas **não exposto por endpoint** — referência de domínio (espelha o `nippleDepth.ts` do frontend). |
| `routers/projects.py` | CRUD de projetos. |
| `routers/auth.py` | Login e identidade do token. |
| `routers/changelog.py` | Log de alterações (append-only; POST requer admin). |
| `routers/base.py` | Edição da base de linhas de pacote (admin). |
| `routers/logic.py` | Escopos de lógica: CRUD, versionamento, grupos. |

Contrato completo de endpoints: README do repo do backend —
[SPRINT-V2.1-backend](https://github.com/mursoares-prog/SPRINT-V2.1-backend).

---

## 5. Mapa do frontend (`abandono-app/src/`)

Detalhado no [README deste repo](../README.md). Em resumo:
`context/AppContext.tsx` (estado global) · `engines/` (lógica pura) · `data/` (domínio) ·
`components/` (UI, incluindo os editores de lógica em ReactFlow) · `utils/api.ts` (cliente HTTP).

---

## 6. Autenticação e papéis

Usuários em `auth_users.json` (gitignored; ver `auth_users.example.json`). Dois papéis:
`admin` (edita base e lógica) e `projetista` (leitura). Senhas em PBKDF2-SHA256; token de
sessão assinado com HMAC usando `AUTH_SECRET`. Sem backend acessível, o frontend cai no
**login legado offline** (`teste/teste123`, papel projetista).

---

## 7. Restrições e pendências para produção

Pontos que a equipe que assume deve conhecer:

- **Python 3.10+ obrigatório** no backend (uso de sintaxe `X | None`). Ambientes com 3.9
  falham na coleta dos testes/subida do app.
- **Migrações de banco:** hoje o schema é criado por `create_all` + micro-migrações
  `ADD COLUMN` idempotentes em `main.py`. Para evoluções maiores, migrar para **Alembic**.
- **SQLite em produção precisa de volume persistente** (senão o arquivo some a cada restart),
  ou trocar `DATABASE_URL` por Turso/Postgres. Ver runbook no README do backend.
- **`AUTH_SECRET` e `CORS_ORIGINS` são obrigatórios** em produção (o CORS de dev libera
  qualquer porta de localhost via regex — restrinja no deploy).
- **Bundle de tamanho único:** o `vite build` emite um chunk > 500 kB (aviso). Considerar
  code-splitting por `import()` se o tempo de carga for um problema.
- **`logicScopesBundle.json` é um artefato gerado** a partir das árvores de decisão do
  backend. O script gerador (`scripts/dump-logic-bundle.py`) foi removido nesta limpeza;
  se a equipe precisar regenerá-lo, recriar a exportação a partir de `/api/logic/*`.
- **Roadmap — geração autoritativa no servidor:** hoje a geração do cronograma é 100%
  frontend. Se, para a integração com os sistemas da empresa, for necessário gerar/validar
  o cronograma no servidor (integridade, consumo por outros sistemas), o caminho recomendado
  é **portar o interpretador de árvores para Python** — `generateScheduleFromLogic` +
  `applyTransitions`/`applyTimeline`/`normalizeScopePhases`. Como a lógica de domínio mora
  nos **dados** (as árvores, já persistidas no backend), só o interpretador precisaria existir
  em duas linguagens (peça pequena e estável), sem duplicar a lógica de domínio. Foi por isso
  que a antiga engine estática espelhada (`sequence_engine.py`) foi removida em vez de mantida:
  ela espelhava a engine antiga, não a de árvores.

---

## 8. Como verificar que nada quebrou

```bash
# Backend (Python 3.10+)
cd backend && pytest -q                 # 119/119

# Frontend
cd abandono-app && npm run build        # tsc -b (0 erros) + vite build
```

O `npm run build` roda o type-check autoritativo (`tsc -b`); ele deve terminar **sem erros**.
