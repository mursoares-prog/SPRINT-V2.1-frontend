# Fluxo da engine — `sequenceEngine.ts`

Mapa de leitura dos diagramas abaixo, com referências de linha em
`abandono-app/src/engines/sequenceEngine.ts`.

A engine é um **pipeline de 2 passadas** dentro de `generateSchedule(inputs)` (linha 74):

1. **Passo 1 — Loop por step:** percorre a sequência base do escopo e insere os pacotes
   reais (e montagens/desmontagens "ingênuas" marcadas `autoInserted`).
2. **Passo 2 — `applyTransitions`:** descarta as montagens/desmontagens `autoInserted` e
   reconstrói toda a camada de mount/dismount de equipamento de pressão com as regras corretas.
3. **Finalização:** `applyTimeline` calcula `startDay`/`endDay` e há a reclassificação de
   fase pela TCap (linhas 1367-1382).

---

## 1. Pipeline geral (`generateSchedule`)

```mermaid
flowchart TD
    A["WizardInputs<br/>(respostas do assistente)"] --> B["deriveBaseMode(scopeId)<br/>through_tubing vs through_casing"]
    B --> C["SEQUENCES[scopeId]<br/>escolhe lista de steps ANC ou DP"]
    C --> D["PASSO 1: loop pelos steps<br/>(gera items brutos)"]
    D --> E["items[]<br/>com mount/dismount autoInserted 'ingênuos'"]
    E --> F["filtra: descarta autoInserted<br/>baseItems = só operações reais"]
    F --> G["PASSO 2: applyTransitions(baseItems)<br/>reconstrói mount/dismount corretos"]
    G --> H["applyTimeline()<br/>calcula startDay / endDay"]
    H --> I{"Há desassentamento<br/>de TCap?"}
    I -->|"Sim (idx >= 0)"| J["tudo até a TCap -> Fase 0"]
    I -->|"Não"| K["Fase 0 -> fase inicial do escopo<br/>(FS2 -> Fase 2, senão Fase 1A)"]
    J --> L["ScheduleItem[] final"]
    K --> L
```

---

## 2. Passo 1 — Loop por step

```mermaid
flowchart TD
    Start(["para cada step da sequência"]) --> Cond{"step.condition<br/>satisfeita pelos inputs?"}
    Cond -->|"não"| Skip["continue (pula o step)"]
    Cond -->|"sim / sem condição"| Type{"que tipo de step?"}

    Type -->|"packageId termina em _INJECT<br/>(~30 handlers)"| Handler["Handler especial<br/>ex.: TCAP_INJECT, CSB_INJECT,<br/>FT_CEMENT_INJECT, ISOLATION_INJECT,<br/>PLUG_INJECT, PERF_INJECT..."]
    Handler --> HLogic["lê inputs específicos -> decide<br/>quais ABAN/NOVO inserir, em que ordem,<br/>marca isContingency / contingencyReason"]
    HLogic --> AddH["addItem(...) 1..N pacotes<br/>(pode inserir mount/dismount via getMount/getDismount)"]
    AddH --> Next

    Type -->|"pacote normal (ABAN/NOVO)"| Subst["substituições contextuais do pkgId<br/>LWO: 031A->031B, FETH->FIBAP;<br/>DMM c/ equip.; plug TMF troca teste interface..."]
    Subst --> Supress{"deve suprimir?<br/>(NOVO 017/018/019/020,<br/>ABAN 011/012 dup. TCap...)"}
    Supress -->|"sim"| Skip
    Supress -->|"não"| Tech["Gestão de tecnologia (ingênua):<br/>isMountOp / isDismountOp / troca de tech<br/>-> insere dismount+mount autoInserted<br/>atualiza currentTech e bopActive"]
    Tech --> AddN["addItem(pkg) com contingência<br/>resolvida (stuck_risk / fejat / step)"]
    AddN --> Next

    Skip --> Next(["próximo step"])
    Next --> Start
```

Estágios do loop (linha 91):

- **Condições** (93-101): filtros simples (`clean_flowlines`, `remove_anm`, `stuck_risk`...).
- **Handlers `*_INJECT`** (104-1274): a lógica de domínio. Ex.: `TCAP_INJECT` (219),
  `FT_CEMENT_INJECT` (491), `ISOLATION_INJECT` (815), `PLUG_INJECT` (962).
- **Pacote normal** (1276-1354): substituições contextuais, supressões anti-duplicata e
  gestão *ingênua* de tecnologia.

---

## 3. Passo 2 — `applyTransitions` (máquina de estados de mount/dismount)

```mermaid
flowchart TD
    A["baseItems (sem autoInserted)"] --> B["cleaned = remove mounts/dismounts<br/>de WL/electric/CT (mantém só BOP)"]
    B --> C(["para cada item de cleaned[]"])

    C --> D{"pkg é BOP<br/>mount/dismount?"}
    D -->|"sim"| D1["dismount() do equipamento sobreposto<br/>alterna bopActive<br/>(muda mode: through_casing/tubing)"]
    D1 --> Loop

    D -->|"não"| E{"é jogo de polias?<br/>(tech WL/EL/CT + transitionTechnology='none')"}
    E -->|"sim"| E1{"polias é contingência E<br/>tech firme volta adiante?<br/>needsTechAhead"}
    E1 -->|"sim"| E2["marca pendingContingencyRemount<br/>dismount(forceContingency)"]
    E1 -->|"não"| E3["dismount() normal"]
    E2 --> Loop
    E3 --> Loop

    E -->|"não"| F{"op exige equipamento?<br/>(effectiveTech WL/EL/CT)"}
    F -->|"não (none/workstring)"| G["mantém estado, push item"]
    G --> H

    F -->|"sim"| I{"é contingência c/ tech ≠ firme<br/>E firme volta adiante?"}
    I -->|"sim"| I1["força dismount contingencial<br/>+ marca remontagem"]
    I -->|"não"| J["ensureMount(tech)"]
    I1 --> J

    J --> J1{"resolve montagem:<br/>overlay? firme? restauração?"}
    J1 -->|"contingência c/ tech ≠ sessão firme"| J2["monta OVERLAY<br/>(não desmonta firme por baixo)"]
    J1 -->|"mesma tech já montada"| J3["reusa; promoteMountToFirm se op firme"]
    J1 -->|"tech diferente firme"| J4["dismount atual + mount novo<br/>(bore anular ANC -> 033/031B)"]
    J2 --> H
    J3 --> H
    J4 --> H

    H["push item"] --> K{"ainda precisa da tech<br/>adiante? needsTechAhead"}
    K -->|"overlay não precisa"| K1["dismountOverlay()"]
    K -->|"firme não precisa<br/>E próxima não é overlay conting."| K2["dismount()"]
    K -->|"sim, precisa"| Loop
    K1 --> Loop
    K2 --> Loop

    Loop(["próximo item"]) --> C
    C --> End["result[] = mount/dismount reconstruídos"]
```

Estado rastreado por `applyTransitions` (linha 1418):

- **sessão firme** vs **overlay** (contingência com tecnologia diferente monta por cima
  sem desmontar a firme);
- **jogo de polias** (`transitionTechnology: 'none'` -> equipamento desmontado);
- **remontagem contingencial** (`pendingContingencyRemountTech`);
- **bore anular vs produção** no ANC (033/031B);
- look-ahead via `needsTechAhead` (1592) para só desmontar quando a tecnologia não volta.
