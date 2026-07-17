import type { RigType } from '../types'

export type LCondition = 'rig_anc' | 'rig_dp' | 'rig_lwo' | 'rig_dp_gen'

// Rótulos humanos das condições de emissão de pacote (editor/admin).
export const CONDITION_LABELS: Record<LCondition, string> = {
  rig_anc: 'Sonda ANC',
  rig_dp: 'Sonda DP',
  rig_lwo: 'Sonda DP LWIV',
  rig_dp_gen: 'Sonda DP Generalista',
}

// Avalia a condição de emissão de um pacote contra sonda/operação. Fonte única de
// verdade para o engine (checkCondition) e para a exibição das perguntas (etapa 2),
// garantindo que decisões DP-only não apareçam em sonda ANC e vice-versa.
// rig_dp = qualquer DP (generalista ou LWIV); rig_dp_gen = DP generalista (sem LWIV);
// rig_lwo = DP LWIV (opType=LWO); rig_anc = sonda ancorada.
export function conditionMatches(
  condition: LCondition | undefined,
  rigType: string | undefined,
  opType: string | undefined,
): boolean {
  if (!condition) return true
  switch (condition) {
    case 'rig_anc':    return rigType === 'ANC'
    case 'rig_dp':     return rigType === 'DP'
    case 'rig_dp_gen': return rigType === 'DP' && opType !== 'LWO'
    case 'rig_lwo':    return opType === 'LWO'
    default:           return true
  }
}

export type LPkgPhase = 'Fase 0' | 'Fase 1A' | 'Fase 1B' | 'Fase 2' | 'Extra Abandono' | 'Mobilização' | 'Desmobilização'
export type LTech = 'wireline' | 'ct' | 'electric' | 'workstring' | 'bop' | 'none'

export type LPkg = {
  id: string
  name: string
  // Campos opcionais para execução pela logicEngine:
  phase?: LPkgPhase
  isContingency?: boolean
  contingencyReason?: string
  technology?: LTech
  transitionTechnology?: LTech
  condition?: LCondition
}

export type LSeqEntry = { label: string; note?: string; packages?: LPkg[]; sub?: LDec[]; afterSub?: LDec[]; contingency?: boolean }

// Posição manual de um nó no editor de fluxo (ReactFlow). Persistida junto com o
// escopo; ausente = posição calculada pelo layout automático.
export type LPos = { x: number; y: number }

export interface LAns {
  label: string
  active?: boolean
  note?: string
  packages?: LPkg[]
  sub?: LDec[]
  seq?: LSeqEntry[]  // respostas sequenciais abaixo desta (sem decisão intermediária)
  after?: LSeqEntry[]  // blocos (pacotes/sequenciais) emitidos APÓS a convergência da subárvore
                       // desta resposta — renderizados no rodapé do chip, emitidos após `sub`.
  afterSub?: LDec[]    // decisões emitidas após a convergência da subárvore desta resposta
                       // (endereçadas em DecRef.sub com índice negativo: -(idx+1))
  goto?: string      // texto da pergunta destino (link visual entre respostas e decisões)
  contingency?: boolean  // marca esta resposta (e seu bloco) como variante de contingência,
                         // evitando duplicar todo o bloco só para mudar firme→contingência
  // Mapeamento para WizardInputs (field + value → seleciona esta resposta):
  field?: string
  value?: unknown
  _pos?: LPos        // posição manual no editor de fluxo (ausente = layout automático)
  // Transiente (UI): resposta alterada desde o último salvamento. Removido ao salvar.
  _dirty?: boolean
}

export interface LDec {
  question: string
  answers: LAns[]
  packages?: LPkg[]     // pacotes sempre emitidos ao se atingir esta decisão, independente da resposta
  after?: LSeqEntry[]   // entradas sequenciais exibidas após a convergência das respostas
  afterDec?: LDec[]     // perguntas (decisões) exibidas após a convergência, antes dos chips `after`
  reuseScope?: boolean  // "Já respondida no escopo": pergunta repetida que herda a resposta dada
                        // na 1ª ocorrência da MESMA pergunta no escopo. Não é exibida no passo 2
                        // (não pergunta de novo), mas o ramo resolvido continua emitindo pacotes.
  _pos?: LPos           // posição manual do nó de pergunta no editor de fluxo
  _convPos?: LPos       // posição manual do nó de convergência desta pergunta
  // Editor MANUAL: decisão de topo "flutuante" — desconectada do encadeamento visual da seção
  // (linha de entrada cortada). Continua no array da seção (executa em ordem), mas sem aresta
  // de sequência desenhada, até ser religada por gesto.
  _float?: boolean
  // Transiente (UI): pergunta alterada/criada desde o último salvamento. Removido ao salvar.
  _dirty?: boolean
}

export interface LSec {
  id: string
  label: string
  phase: string
  color: 'gray' | 'blue' | 'amber'
  always?: LPkg[]
  alwaysAfterIdx?: number  // posição do chip SEMPRE: -1 (ou omisso) = antes de todas decisões; N = após decisions[N]
  decisions: LDec[]
  // Filtros de execução (ausentes = aplica para todos):
  rigTypes?: RigType[]
  opTypes?: ('Generalista' | 'LWO')[]
  // Reuso vivo: quando presente, esta seção é um PLACEHOLDER que inclui as seções de
  // outro escopo (resolvidas na geração/consumo, não copiadas). Edições no escopo de
  // origem propagam automaticamente. `decisions` fica vazio; `label` é só rótulo do card.
  ref?: { scopeId: string; label?: string }
  _pos?: LPos  // posição manual do card de seção no editor de fluxo
}

// ── SEÇÕES COMPARTILHADAS (Fase 0 / 1A) ────────────────────────────────────

// CCAP: idêntico para DP e ANC.
const _MOB_POST_CCAP: LDec = {
  question: 'Cap de corrosão (CCAP)?',
  answers: [
    { label: 'Não', active: true },
    { label: 'Sim', sub: [{
      question: 'Método de retirada da CCAP?',
      answers: [
        { label: 'Coluna de trabalho', active: true, packages: [
          { id: 'ABAN 008', name: 'Retirada de CCAP com coluna de trabalho (garatéia)' },
        ]},
        { label: 'Cabo', packages: [
          { id: 'ABAN 009', name: 'Retirada de CCAP a cabo' },
        ]},
      ],
    }]},
  ],
}

// Hidrato na ANM: pacotes de dissociação diferem por rig (165/166 DP; 169/170 ANC),
// resolvidos por condition. Firme/contingencial conforme o valor de anmHydrate
// (só emitido quando anmValveContingency inclui 'hydrate' — espelha ANM_HYDRATE_INJECT).
// Contingências de abertura de válvulas da ANM (espelha ANM_VALVE_INJECT):
// jateamento (125) e gabaritagem FT (124) são independentes e sempre contingenciais.
// Sem field/value: o resolver aplica o guard "adiadas quando há plug de produção no TMF".
// ── MOB/TCap — espelha a engine (tabela 211/212/011 + TCAP_INJECT + ITF/RISER_FLUID) ──
// Fases: pacotes até a âncora da TCap (010/020/021/022/177) herdam a Fase 0 da seção;
// tudo o que vem depois leva phase 'Fase 1A' explícita (normalizeScopePhases cuida do resto).

// Hidrato no conector da TCap (após o desassentamento): 177 é a âncora da Fase 0.
const _HIDRATO_TCAP_DEC: LDec = {
  question: 'Hidrato no conector TCap?',
  answers: [
    { label: 'Não', active: true },
    { label: 'Sim', field: 'contingencyTcapHydrate', value: 'yes', packages: [
      { id: 'ABAN 177', name: 'Jateamento de água aquecida no conector TCap' },
    ]},
    { label: 'Contingência', field: 'contingencyTcapHydrate', value: 'contingency', packages: [
      { id: 'ABAN 177', name: 'Jateamento de água aquecida no conector TCap', isContingency: true,
        contingencyReason: 'Contingência: dissociação de hidrato no conector da TCap — jateamento de água aquecida' },
    ]},
  ],
}

// Reentrada + fluido pós-conexão (comum a DP e ANC via conditions). Os testes de
// interface/válvula seguem em decisões próprias (a retirada de plugs do TMF entra entre eles).
// Embarcado como sub-decisão nos ramos que terminam com conexão na ANM; ausente no
// ramo "conjunto no fundo → conectar na TCap" (sem reentrada na ANM).
const _REENTRADA: LDec = {
  question: 'Reentrada e conexão na ANM?',
  answers: [{
    label: 'Executar', active: true,
    packages: [{ id: 'ABAN 023', name: 'Reentrada e conexão na ANM', phase: 'Fase 1A' }],
    sub: [{
      question: 'Fluido inibido pós-conexão?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'tcapSurfaceFluid', value: 'inhibited_post', packages: [
          { id: 'ABAN 217', name: 'Posicionamento de fluido inibido pós-conexão (ANC)', phase: 'Fase 1A', condition: 'rig_anc' },
          { id: 'ABAN 216', name: 'Posicionamento de fluido inibido pós-conexão (DP)', phase: 'Fase 1A', condition: 'rig_dp' },
        ]},
      ],
    }],
  }],
}

// Testes de interface (024/025) — com plug no TMF o teste usa o bore correspondente (026/027).
const _ITF_TEST_PROD: LDec = {
  question: 'Teste de interface — produção?',
  answers: [
    { label: 'Padrão (sem plug)', active: true, packages: [
      { id: 'ABAN 024', name: 'Teste funcional — bloco produção', phase: 'Fase 1A' },
    ]},
    { label: 'Com plug no TMF', packages: [
      { id: 'ABAN 026', name: 'Teste de interface — bore produção (com plug)', phase: 'Fase 1A' },
    ]},
  ],
}
const _ITF_TEST_ANUL: LDec = {
  question: 'Teste de interface — anular?',
  answers: [
    { label: 'Padrão (sem plug)', active: true, packages: [
      { id: 'ABAN 025', name: 'Teste funcional — bloco anular', phase: 'Fase 1A' },
    ]},
    { label: 'Com plug no TMF', packages: [
      { id: 'ABAN 027', name: 'Teste de interface — bore anular (com plug)', phase: 'Fase 1A' },
    ]},
  ],
}

// Retirada de plugs do TMF (espelha PLUG_INJECT Fase 1A): anular (035 + contingências +
// limpeza FT no DP + teste de bloco adiado 029) e produção (034 + contingências + 028),
// seguidos das contingências de válvula adiadas (125/124).
// Contingências de válvula adiadas para depois da retirada do plug de produção.
// Teste da válvula do anular (218) — após interface/plugs, antes do hidrato.
// ── BLOCO: MOBILIZAÇÃO / DESCIDA / CONEXÃO ───────────────────────────────────
// V1: bloco original (ID mantido para compatibilidade com overrides salvos no backend).
// V2: inclui "Conjunto de WO no fundo?" e ramo "Modo ANM" — usado pelos escopos ativos.
export const BLK_MOB_DESCIDA_DP_COND_ID    = 'BLK_MOB_DESCIDA_DP_COND'
export const BLK_MOB_DESCIDA_DP_COND_V2_ID = 'BLK_MOB_DESCIDA_DP_COND_V2'

// Placeholder V1 — mantido apenas para o bloco legado (sobrescrito por override no backend).
// Placeholder V2 — aponta para o bloco com lógica de conjunto no fundo / modo ANM.
const SEC_MOB_REF_V2: LSec = {
  id: 'mob', label: 'MOBILIZAÇÃO / DESCIDA / CONEXÃO', phase: 'Fase 0', color: 'gray',
  decisions: [],
  ref: { scopeId: BLK_MOB_DESCIDA_DP_COND_V2_ID, label: 'MOB · Descida DP v2 (conjunto no fundo / modo ANM)' },
}

// ── BLOCO: MOBILIZAÇÃO / DESCIDA / CONEXÃO — Condicionais por tipo de sonda ──
// Bloco de MOB usado (via ref) no início dos escopos FSU/FS1, sem as perguntas
// "Tipo de sonda?". Pacotes DP-específicos → condition: 'rig_dp'; ANC → 'rig_anc'.
// DMA (ANC) entra como always da seção. As decisões de transponder/DMM, CCAP, TCap e
// reentrada ficam planas; o engine filtra os pacotes de cada ramo pelo rigType.
// (BLK_MOB_DESCIDA_DP_COND_ID é declarado acima, junto do placeholder SEC_MOB_REF.)

// Arranjo de superfície + flush: DP usa SFT (246) e flush DPR (014); ANC usa Terminal
// Head (247) e flush Riser Dual Bore (015); LWO monta ITF (206) independente de sonda.
// 246/247 são de operação Generalista — usam condition composta (sonda + Generalista)
// para não emitir junto com o ITF (206) em operações LWO. O flush (014/015) é só por sonda.
const _ARRANJO_FLUSH_COND: LPkg[] = [
  { id: 'ABAN 246', name: 'Montagem do SFT (DP Generalista)', phase: 'Fase 1A', condition: 'rig_dp_gen' },
  { id: 'ABAN 247', name: 'Montagem do Terminal Head (ANC)', phase: 'Fase 1A', condition: 'rig_anc' },
  { id: 'ABAN 206', name: 'Montagem de ITF (LWO)', phase: 'Fase 1A', condition: 'rig_lwo' },
  { id: 'ABAN 014', name: 'Flush do DPR/HCR', phase: 'Fase 1A', condition: 'rig_dp' },
  { id: 'ABAN 015', name: 'Flush Riser Dual Bore com agmar', phase: 'Fase 1A', condition: 'rig_anc' },
]

// Fluido de riser: DP usa DPR/HCR (215/016), ANC usa Riser Dual Bore (209/017).
const _FLUIDO_RISER_COND: LDec = {
  question: 'Fluido de riser inibido?',
  answers: [
    { label: 'Sim', field: 'riserFluid', value: 'inhibited', packages: [
      { id: 'ABAN 215', name: 'Posicionamento de fluido inibido no DPR/HCR', phase: 'Fase 1A', condition: 'rig_dp' },
      { id: 'ABAN 209', name: 'Posicionamento de fluido inibido no Riser Dual Bore', phase: 'Fase 1A', condition: 'rig_anc' },
    ]},
    { label: 'N₂ / sem fluido', active: true, packages: [
      { id: 'ABAN 016', name: 'Desalagamento DPR/HCR com Nitrogênio', phase: 'Fase 1A', condition: 'rig_dp' },
      { id: 'ABAN 017', name: 'Desalagamento Riser Dual Bore com Nitrogênio', phase: 'Fase 1A', condition: 'rig_anc' },
    ]},
  ],
}

// Fluido pós-TCap fundeada: arranjo+flush como dec.packages (mesmo padrão de _FLUIDO_POS_TCAP_DP/ANC).
const _FLUIDO_POS_TCAP_COND: LDec = { ..._FLUIDO_RISER_COND, packages: _ARRANJO_FLUSH_COND }

// Fluido de riser quando TCap vai à superfície: inclui re-descida WO + arranjo como dec.packages.
const _FLUIDO_RISER_SUPERFICIE_COND: LDec = {
  question: 'Fluido no riser (TCap à superfície)?',
  packages: [
    { id: 'ABAN 011', name: 'Descida do conjunto de WO (DPR/HCR)', phase: 'Fase 1A', condition: 'rig_dp' },
    { id: 'ABAN 012', name: 'Descida do Conjunto de WO com Riser Dual Bore', phase: 'Fase 1A', condition: 'rig_anc' },
    ..._ARRANJO_FLUSH_COND,
  ],
  answers: [
    { label: 'N₂', active: true, field: 'tcapSurfaceFluid', value: 'n2', packages: [
      { id: 'ABAN 016', name: 'Desalagamento DPR/HCR com Nitrogênio', phase: 'Fase 1A', condition: 'rig_dp' },
      { id: 'ABAN 017', name: 'Desalagamento Riser Dual Bore com Nitrogênio', phase: 'Fase 1A', condition: 'rig_anc' },
    ]},
    { label: 'Inibido (pré-conexão)', field: 'tcapSurfaceFluid', value: 'inhibited_pre', packages: [
      { id: 'ABAN 215', name: 'Posicionamento de fluido inibido no DPR/HCR', phase: 'Fase 1A', condition: 'rig_dp' },
      { id: 'ABAN 209', name: 'Posicionamento de fluido inibido no Riser Dual Bore', phase: 'Fase 1A', condition: 'rig_anc' },
    ]},
    { label: 'Inibido (pós-conexão)', field: 'tcapSurfaceFluid', value: 'inhibited_post' },
  ],
}

// Quando o conjunto de WO já está no fundo (woAtBottom definido), pulamos preparação e
// descida. O usuário escolhe entre conectar na TCap (ABAN 018) ou montar arranjo+flush+ANM.
// "Movimentar e conectar na TCap": sem reentrada na ANM — _REENTRADA não é embutido.
// "Montar arranjo + flush + ANM": segue com fluido de riser e depois reentrada na ANM.
const _CONJUNTO_NO_FUNDO_OPS_DEC: LDec = {
  question: 'Operação com conjunto no fundo?',
  answers: [
    { label: 'Movimentar e conectar na TCap', field: 'woAtBottom', value: 'tcap',
      packages: [{ id: 'ABAN 018', name: 'Movimentação e conexão na TCap', phase: 'Fase 1A' }],
    },
    { label: 'Montar arranjo + flush + ANM', active: true, field: 'woAtBottom', value: 'anm',
      packages: [..._ARRANJO_FLUSH_COND],
      sub: [_FLUIDO_RISER_COND, _REENTRADA],
    },
  ],
}

const _CONJUNTO_NO_FUNDO_DEC: LDec = {
  question: 'Conjunto de WO no fundo?',
  answers: [
    { label: 'Não', active: true, packages: [
      { id: 'ABAN 212', name: 'Preparação do Conjunto de WO + TRT (reentrada, sem TCap)', phase: 'Fase 1A' },
      { id: 'ABAN 011', name: 'Descida do conjunto de WO (DPR/HCR)', phase: 'Fase 1A', condition: 'rig_dp' },
      { id: 'ABAN 012', name: 'Descida do Conjunto de WO com Riser Dual Bore', phase: 'Fase 1A', condition: 'rig_anc' },
      ..._ARRANJO_FLUSH_COND,
    ], sub: [_FLUIDO_RISER_COND, _REENTRADA] },
    { label: 'Sim', sub: [_CONJUNTO_NO_FUNDO_OPS_DEC] },
  ],
}

// Decisão de TCap unificada: mesma estrutura do _MOB_TCAP_DP, mas pacotes DP/ANC
// diferenciados por condition em vez de ramificados em "Tipo de sonda?".
// _REENTRADA embarcado no final de cada ramo que termina com conexão na ANM.
const _MOB_TCAP_COND: LDec = {
  question: 'Retirar TCap?',
  answers: [
    { label: 'Não / N.A.', active: true, sub: [_CONJUNTO_NO_FUNDO_DEC] },
    { label: 'Sim', sub: [{
      question: 'Método de retirada da TCap?',
      answers: [
        { label: 'ROV', field: 'tcapRemovalMethod', value: 'rov', packages: [
          { id: 'ABAN 010', name: 'Retirar TCap com ROV' },
          { id: 'ABAN 212', name: 'Preparação do Conjunto de WO + TRT (reentrada, sem TCap)', phase: 'Fase 1A' },
          { id: 'ABAN 011', name: 'Descida do conjunto de WO (DPR/HCR)', phase: 'Fase 1A', condition: 'rig_dp' },
          { id: 'ABAN 012', name: 'Descida do Conjunto de WO com Riser Dual Bore', phase: 'Fase 1A', condition: 'rig_anc' },
          ..._ARRANJO_FLUSH_COND,
        ], sub: [_FLUIDO_RISER_COND, _REENTRADA] },
        { label: 'Coluna (TRT)', active: true, field: 'tcapRemovalMethod', value: 'workstring', packages: [
          { id: 'ABAN 211', name: 'Preparação do Conjunto de WO + TRT para retirada/fundeio da TCap' },
          { id: 'ABAN 244', name: 'Descida do Conjunto de WO com DPR/HCR para retirada/fundeio da TCap', condition: 'rig_dp' },
          { id: 'ABAN 245', name: 'Descida do Conjunto de WO com Riser Dual Bore para retirada/fundeio da TCap', condition: 'rig_anc' },
          { id: 'ABAN 018', name: 'Movimentação e conexão na Tcap' },
          { id: 'ABAN 019', name: 'Ventilação de TCap' },
        ], sub: [{
          question: 'Destino da TCap?',
          answers: [
            { label: 'Fundeio', active: true, field: 'tcapDisposition', value: 'bottom', packages: [
              { id: 'ABAN 020', name: 'Desassentamento de TCap e fundeio no leito marinho' },
            ], sub: [_HIDRATO_TCAP_DEC, _FLUIDO_POS_TCAP_COND, _REENTRADA] },
            { label: 'Superfície', field: 'tcapDisposition', value: 'surface', packages: [
              { id: 'ABAN 021', name: 'Desassentamento de TCap e retirada até a superfície com DPR/HCR', condition: 'rig_dp' },
              { id: 'ABAN 022', name: 'Desassentamento de TCap e retirada até a superfície com Riser Dual Bore', condition: 'rig_anc' },
            ], sub: [_HIDRATO_TCAP_DEC, _FLUIDO_RISER_SUPERFICIE_COND, _REENTRADA] },
          ],
        }]},
      ],
    }]},
  ],
}

// Transponder/DMM com condition: 'rig_dp' em todos os pacotes — para ANC, o engine
// filtra esses pacotes e a decisão produz resultado vazio (sem impacto no cronograma).
const _TRANSPONDER_DMM_COND: LDec = {
  question: 'Modo do transponder?',
  answers: [
    { label: 'ROV', active: true, packages: [
      { id: 'ABAN 002', name: 'Recolhimento de transponder com ROV', condition: 'rig_dp' },
    ], sub: [{
      question: 'DMM — equipamento subsea no fundo?',
      answers: [
        { label: 'Não', active: true, packages: [
          { id: 'ABAN 003', name: 'DMM', condition: 'rig_dp' },
          { id: 'ABAN 007', name: 'Lançamento de transponder com ROV e calibração DP', condition: 'rig_dp' },
        ]},
        { label: 'Sim — Fase 1', packages: [
          { id: 'ABAN 004', name: 'DMM - Fase 1 / Stack-up SSUB no fundo', condition: 'rig_dp' },
          { id: 'ABAN 007', name: 'Lançamento de transponder com ROV e calibração DP', condition: 'rig_dp' },
        ]},
        { label: 'Sim — Fase 2', packages: [
          { id: 'ABAN 005', name: 'DMM - Fase 2 / BOP no fundo', condition: 'rig_dp' },
          { id: 'ABAN 007', name: 'Lançamento de transponder com ROV e calibração DP', condition: 'rig_dp' },
        ]},
      ],
    }]},
    { label: 'COT', packages: [
      { id: 'ABAN 001', name: 'Recolhimento de transponder com COT', condition: 'rig_dp' },
    ], sub: [{
      question: 'DMM — equipamento subsea no fundo?',
      answers: [
        { label: 'Não', active: true, packages: [
          { id: 'ABAN 003', name: 'DMM', condition: 'rig_dp' },
          { id: 'ABAN 006', name: 'Lançamento de transponder com COT e calibração DP', condition: 'rig_dp' },
        ]},
        { label: 'Sim — Fase 1', packages: [
          { id: 'ABAN 004', name: 'DMM - Fase 1 / Stack-up SSUB no fundo', condition: 'rig_dp' },
          { id: 'ABAN 006', name: 'Lançamento de transponder com COT e calibração DP', condition: 'rig_dp' },
        ]},
        { label: 'Sim — Fase 2', packages: [
          { id: 'ABAN 005', name: 'DMM - Fase 2 / BOP no fundo', condition: 'rig_dp' },
          { id: 'ABAN 006', name: 'Lançamento de transponder com COT e calibração DP', condition: 'rig_dp' },
        ]},
      ],
    }]},
  ],
}

const SEC_MOB_DESCIDA_DP_COND: LSec = {
  id: 'mob_cond',
  label: 'MOBILIZAÇÃO / DESCIDA / CONEXÃO (condicionais por sonda)',
  phase: 'Fase 0',
  color: 'gray',
  // DMA: emitido automaticamente pelo engine para sondas ANC (condition: 'rig_anc').
  // Transponder/DMM: pacotes condition: 'rig_dp' — invisíveis para ANC.
  always: [
    { id: 'ABAN 208', name: 'DMA', condition: 'rig_anc' },
  ],
  decisions: [
    _TRANSPONDER_DMM_COND,
    _MOB_POST_CCAP,
    _MOB_TCAP_COND,
    _ITF_TEST_PROD, _ITF_TEST_ANUL,
    // A partir daqui (retirada de plugs do TMF, contingências de válvula, teste da válvula do
    // anular e hidrato na ANM) o fluxo foi movido para o topo dos Blocos ANM
    // (SEC_CONEXAO / bloco "Acesso inicial e amortecimento").
  ],
}

// ── BLOCO: MOBILIZAÇÃO E REENTRADA (modo ANM — navegação com conjunto no fundo) ──
// Variante do MOB para quando se prevê NAVEGAR COM O CONJUNTO DE WO NO FUNDO: o conjunto
// já está pronto e no fundo, então NÃO há preparação (211/212) nem descida (011/012/244/245).
// O passo seguinte é, se houver TCap, conectar nela (coluna: 018+019; ROV: 010) ou ir direto
// às preparações de reentrada na ANM (arranjo SFT/Terminal Head/ITF + flush + fluido de riser
// + reentrada). Daí em diante o fluxo é idêntico ao MOB padrão (testes de interface etc.).
// Reusa as condicionais por sonda existentes (_ARRANJO_FLUSH_COND / _FLUIDO_RISER_COND /
// _REENTRADA) — sem criar novas conditions. 018/019/010 em Fase 1A (mesma convenção do
// ramo "conjunto no fundo" do MOB v2).
export const BLK_MOB_REENTRADA_ANM_ID = 'BLK_MOB_REENTRADA_ANM'

const _REENTRADA_ANM_CONJUNTO_FUNDO: LDec = {
  question: 'TCap a conectar (conjunto no fundo)?',
  answers: [
    { label: 'Sim — conectar na TCap', field: 'woAtBottom', value: 'tcap', sub: [{
      question: 'Método de retirada da TCap?',
      answers: [
        { label: 'Coluna (TRT)', active: true, field: 'tcapRemovalMethod', value: 'workstring', packages: [
          { id: 'ABAN 018', name: 'Movimentação e conexão na Tcap', phase: 'Fase 1A' },
          { id: 'ABAN 019', name: 'Ventilação de TCap', phase: 'Fase 1A' },
        ]},
        { label: 'ROV', field: 'tcapRemovalMethod', value: 'rov', packages: [
          { id: 'ABAN 010', name: 'Retirar TCap com ROV', phase: 'Fase 1A' },
        ]},
      ],
    }]},
    { label: 'Não — preparar reentrada na ANM', active: true, field: 'woAtBottom', value: 'anm',
      packages: [..._ARRANJO_FLUSH_COND],
      sub: [_FLUIDO_RISER_COND, _REENTRADA],
    },
  ],
}

const SEC_MOB_REENTRADA_ANM: LSec = {
  id: 'mob_reentrada_anm',
  label: 'MOBILIZAÇÃO E REENTRADA (modo ANM — conjunto no fundo)',
  phase: 'Fase 0',
  color: 'gray',
  // DMA (ANC) e transponder/DMM (DP) idênticos ao MOB padrão — filtrados por condition.
  always: [{ id: 'ABAN 208', name: 'DMA', condition: 'rig_anc' }],
  decisions: [
    _TRANSPONDER_DMM_COND,
    _MOB_POST_CCAP,
    _REENTRADA_ANM_CONJUNTO_FUNDO,
    _ITF_TEST_PROD, _ITF_TEST_ANUL,
  ],
}

// FS2: mobilização sem descida do WO / conexão ANM — na Fase 2 o poço já não tem
// ANM; a engine vai de POST_MOB direto para BOP/FETH. Espelha SEQUENCES[FS2_*].
// Seção ÚNICA com condicionais por tipo de sonda (rig_dp/rig_anc), agrupando o que antes
// eram duas seções gated por `rigTypes` (DP e ANC) — mesmo padrão de SEC_MOB_DESCIDA_DP_COND:
//   • DMA (ABAN 208) entra como `always` com condition 'rig_anc' (só ANC);
//   • transponder/DMM usa a variante _COND (pacotes condition 'rig_dp' → só DP);
//   • CCAP (_MOB_POST_CCAP) é comum às duas sondas.
const SEC_MOB_FS2_COND: LSec = {
  id: 'mob', label: 'MOBILIZAÇÃO (Fase 2 — condicionais por sonda)', phase: 'Fase 0', color: 'gray',
  always: [{ id: 'ABAN 208', name: 'DMA', condition: 'rig_anc' }],
  decisions: [_TRANSPONDER_DMM_COND, _MOB_POST_CCAP],
}

// DHSV: controla inclusão de ABAN 030 (teste funcional DHSV por bullheading).
// Reentrada ANM, testes funcionais e hidrato foram absorvidos em SEC_MOB_DP/ANC.
// SEC_CONEXAO — gerado do override BLK_ACESSO_AMORTEC (promovido a padrão)
const SEC_CONEXAO: LSec = {
  id: 'conexao', label: 'DHSV / BLOCOS ANM', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Retirar plug do TMF — anular?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          packages: [
            { id: 'ABAN 035', name: 'Retirada de plug do TMF (bore anular)', phase: 'Fase 1A' },
          ],
          sub: [
            {
              question: 'Conting. plug anular — stroker?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  field: 'tmfPlugContingencyAnul',
                  value: 'stroker',
                  packages: [
                    { id: 'ABAN 089', name: 'Retirada de plug do TMF (anular) com stroker', phase: 'Fase 1A', isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (anular) com stroker' },
                  ],
                },
              ],
            },
            {
              question: 'Conting. plug anular — flexitubo?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  field: 'tmfPlugContingencyAnul',
                  value: 'ft',
                  packages: [
                    { id: 'ABAN 122', name: 'Flexitubo - Retirada de plug do TMF (anular)', phase: 'Fase 1A', isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (anular) com flexitubo' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Retirar plug do TMF — produção?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          packages: [
            { id: 'ABAN 034', name: 'Retirada de plug do TMF (bore produção)', phase: 'Fase 1A' },
          ],
          sub: [
            {
              question: 'Conting. plug produção — stroker?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  field: 'tmfPlugContingencyProd',
                  value: 'stroker',
                  packages: [
                    { id: 'ABAN 088', name: 'Retirada de plug do TMF (produção) com stroker', phase: 'Fase 1A', isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (produção) com stroker' },
                  ],
                },
              ],
            },
            {
              question: 'Conting. plug produção — flexitubo?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  field: 'tmfPlugContingencyProd',
                  value: 'ft',
                  packages: [
                    { id: 'ABAN 123', name: 'Flexitubo - Retirada de plug do TMF (produção)', phase: 'Fase 1A', isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (produção) com flexitubo' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Hidrato na ANM?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'anmHydrate',
          value: 'yes',
          packages: [
            { id: 'ABAN 169', name: 'Dissociação hidrato — prod. (ANC)', phase: 'Fase 1A', condition: 'rig_anc' },
            { id: 'ABAN 165', name: 'Dissociação hidrato — prod. (DP)', phase: 'Fase 1A', condition: 'rig_dp' },
            { id: 'ABAN 170', name: 'Dissociação hidrato — anular (ANC)', phase: 'Fase 1A', condition: 'rig_anc' },
            { id: 'ABAN 166', name: 'Dissociação hidrato — anular (DP)', phase: 'Fase 1A', condition: 'rig_dp' },
          ],
        },
        {
          label: 'Contingência',
          field: 'anmHydrate',
          value: 'contingency',
          packages: [
            { id: 'ABAN 169', name: 'Dissociação hidrato — prod. (ANC)', phase: 'Fase 1A', condition: 'rig_anc', isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na ANM — bloco de produção' },
            { id: 'ABAN 165', name: 'Dissociação hidrato — prod. (DP)', phase: 'Fase 1A', condition: 'rig_dp', isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na ANM — bloco de produção' },
            { id: 'ABAN 170', name: 'Dissociação hidrato — anular (ANC)', phase: 'Fase 1A', condition: 'rig_anc', isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na ANM — bloco de anular' },
            { id: 'ABAN 166', name: 'Dissociação hidrato — anular (DP)', phase: 'Fase 1A', condition: 'rig_dp', isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na ANM — bloco de anular' },
          ],
        },
      ],
    },
    {
      question: 'Abrir válvula da ANM com FT?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'anmForceOpen',
          value: 'yes',
          sub: [
            {
              question: 'Martelete de FT?',
              answers: [
                {
                  label: 'Não',
                },
                {
                  label: 'Sim',
                  active: true,
                  field: 'anmForceMethod',
                  value: 'hammer',
                  packages: [
                    { id: 'ABAN 143', name: 'Flexitubo — Martelete para abertura de válvula ANM' },
                  ],
                },
              ],
            },
            {
              question: 'Motor + broca?',
              answers: [
                {
                  label: 'Não',
                },
                {
                  label: 'Sim',
                  active: true,
                  field: 'anmForceMethod',
                  value: 'motor_broca',
                  packages: [
                    { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem' },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Contingência',
          field: 'anmForceOpen',
          value: 'contingency',
          sub: [
            {
              question: 'Martelete de FT?',
              answers: [
                {
                  label: 'Não',
                },
                {
                  label: 'Sim',
                  active: true,
                  field: 'anmForceMethod',
                  value: 'hammer',
                  packages: [
                    { id: 'ABAN 143', name: 'Flexitubo — Martelete para abertura de válvula ANM', isContingency: true, contingencyReason: 'Contingência: abertura de válvula da ANM com martelete (FT)' },
                  ],
                },
              ],
            },
            {
              question: 'Motor + broca?',
              answers: [
                {
                  label: 'Não',
                },
                {
                  label: 'Sim',
                  active: true,
                  field: 'anmForceMethod',
                  value: 'motor_broca',
                  packages: [
                    { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem', isContingency: true, contingencyReason: 'Contingência: gabaritagem com motor de fundo e broca para abertura de válvulas da ANM' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}


// Amortecimento COP/COI (LIMPEZA_INJECT): fluido conforme initialFillFluid; poço isolado
// (killWellFase1A 'no') suprime; 'contingency' marca como contingencial. Usado 2× (pré e
// pós-canhoneio) — os rótulos compostos evitam sub-níveis para a combinação kill×fluido.
const _AMORT_COP_ANSWERS: LAns[] = [
  { label: 'Diesel + FCBA', active: true, packages: [
    { id: 'ABAN 061', name: 'Limpeza e Amort. COP (bullheading diesel + FCBA)' },
  ]},
  { label: 'MEG + FCBA', packages: [
    { id: 'ABAN 062', name: 'Limpeza e Amort. COP (bullheading MEG + FCBA)' },
  ]},
  { label: 'Diesel puro', packages: [
    { id: 'ABAN 219', name: 'Preenchimento de anular A e coluna com diesel' },
  ]},
  { label: 'Não / N.A.' },
  { label: 'Contingência — Diesel + FCBA', packages: [
    { id: 'ABAN 061', name: 'Limpeza e Amort. COP (bullheading diesel + FCBA)',
      isContingency: true, contingencyReason: 'Contingência: amortecimento da COP/COI' },
  ]},
  { label: 'Contingência — MEG + FCBA', packages: [
    { id: 'ABAN 062', name: 'Limpeza e Amort. COP (bullheading MEG + FCBA)',
      isContingency: true, contingencyReason: 'Contingência: amortecimento da COP/COI' },
  ]},
]

// Pescaria de cauda (TAIL_FISHING_INJECT): uma decisão por elemento, na ordem da engine;
// método define o pacote (arame/stroker/FT). Resolvida de inputs.tailFishingItems.
// Perguntas por elemento (mesmo texto/pacotes de antes — os resolvers _tailResolver casam
// por essas perguntas). Agora aninhadas sob o gate _TAIL_FISHING_GROUP.
// Gate único do grupo de pescaria de cauda: 'Sim' abre as perguntas por elemento
// (multi-elemento — cada elemento segue independente). O resolver 'Pescaria na cauda?'
// (logicEngine) responde 'Sim' quando há algum elemento em inputs.tailFishingItems.
// Perfis de investigação (espelha INVESTIGATION_INJECT, na ordem da engine). Textos completos
// mantidos — os resolvers _invLogResolver casam por essas perguntas. Aninhados sob o gate abaixo.
// Gate único do grupo de investigação: 'Sim' abre os perfis (cada perfil segue independente).
// O resolver 'Investigação?' (logicEngine) responde 'Sim' quando há perfis em inputs.investigationLogs.
// Sub-decisões da operação de VGL (VGL_INJECT); replace acrescenta a instalação da nova VGL.
// SEC_GAB — gerado do override BLK_ACESSO_AMORTEC (promovido a padrão)
const SEC_GAB: LSec = {
  id: 'gab', label: 'ANULAR / CAMISÃO / GABARITAGEM', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Plug no TH?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          packages: [
            { id: 'ABAN 052', name: 'Retirada de plug 3,75" no TH' },
          ],
        },
      ],
    },
    {
      question: 'Remover gás do anular A?',
      answers: [
        {
          label: 'Sim',
          active: true,
          sub: [
            {
              question: 'Pressão no anular (prof. ANM) pode ser zerada?',
              answers: [
                {
                  label: 'Sim',
                  active: true,
                  packages: [
                    { id: 'ABAN 063', name: 'Limpeza e Amortecimento - Anular A (Despressurização total + bullheading FCBA)' },
                  ],
                },
                {
                  label: 'Não, E.O. restrito (mín. > 0)',
                  sub: [
                    {
                      question: 'Top kill?',
                      answers: [
                        {
                          label: 'Top kill — Fluido inibido',
                          active: true,
                          packages: [
                            { id: 'ABAN 065', name: 'Amort. anular A (steps depress. + top kill MEG/FCBA)' },
                          ],
                        },
                        {
                          label: 'Top kill — diesel',
                          packages: [
                            { id: 'ABAN 064', name: 'Amort. anular A (steps depress. + top kill diesel)' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Não',
        },
      ],
    },
    {
      question: 'Amortecimento COP — fluido?',
      answers: [
        {
          label: 'Diesel + FCBA',
          active: true,
          packages: [
            { id: 'ABAN 061', name: 'Limpeza e Amort. COP (bullheading diesel + FCBA)' },
          ],
        },
        {
          label: 'MEG + FCBA',
          packages: [
            { id: 'ABAN 062', name: 'Limpeza e Amort. COP (bullheading MEG + FCBA)' },
          ],
        },
        {
          label: 'Diesel puro',
          packages: [
            { id: 'ABAN 219', name: 'Preenchimento de anular A e coluna com diesel' },
          ],
        },
        {
          label: 'Não / N.A.',
        },
        {
          label: 'Contingência — Diesel + FCBA',
          packages: [
            { id: 'ABAN 061', name: 'Limpeza e Amort. COP (bullheading diesel + FCBA)', isContingency: true, contingencyReason: 'Contingência: amortecimento da COP/COI' },
          ],
        },
        {
          label: 'Contingência — MEG + FCBA',
          packages: [
            { id: 'ABAN 062', name: 'Limpeza e Amort. COP (bullheading MEG + FCBA)', isContingency: true, contingencyReason: 'Contingência: amortecimento da COP/COI' },
          ],
        },
      ],
    },
    {
      question: 'Teste funcional de DHSV pós-amortecimento?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'installCamisao',
          value: 'contingency',
          packages: [
            { id: 'ABAN 030', name: 'Teste funcional de DHSV (bullheading)' },
          ],
        },
      ],
    },
    {
      question: 'Instalar camisão na DHSV (firme)?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'installCamisao',
          value: 'yes',
          sub: [
            {
              question: 'Método de instalação do camisão?',
              answers: [
                {
                  label: 'Arame',
                  active: true,
                  packages: [
                    { id: 'ABAN 037', name: 'Instalação de camisão na DHSV (arame)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  field: 'camisaoMethod',
                  value: 'ct',
                  packages: [
                    { id: 'ABAN 126', name: 'Flexitubo - Instalação de camisão na DHSV' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Instalar camisão na DHSV (contingência)?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'installCamisao',
          value: 'contingency',
          sub: [
            {
              question: 'Método do camisão (contingência)?',
              answers: [
                {
                  label: 'Arame',
                  active: true,
                  packages: [
                    { id: 'ABAN 037', name: 'Instalação de camisão na DHSV (arame)', isContingency: true },
                  ],
                },
                {
                  label: 'Flexitubo',
                  field: 'camisaoMethod',
                  value: 'ct',
                  packages: [
                    { id: 'ABAN 126', name: 'Flexitubo - Instalação de camisão na DHSV', isContingency: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Gabaritar coluna?',
      answers: [
        {
          label: 'Arame',
          active: true,
          packages: [
            { id: 'ABAN 036', name: 'Gabaritagem da coluna (arame)' },
          ],
        },
        {
          label: 'Perfilagem',
          packages: [
            { id: 'ABAN 098', name: 'Perfilagem caliper — cabo elétrico' },
          ],
        },
        {
          label: 'Flexitubo',
          packages: [
            { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem' },
          ],
        },
        {
          label: 'Não',
        },
      ],
    },
    {
      question: 'Contingência de gabaritagem com FT?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          field: 'contingencyGabaritFT',
          value: 'yes',
          packages: [
            { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem' },
          ],
        },
        {
          label: 'Contingência',
          field: 'contingencyGabaritFT',
          value: 'contingency',
          packages: [
            { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem', isContingency: true, contingencyReason: 'Contingência: gabaritagem com motor de fundo e broca via flexitubo' },
          ],
        },
      ],
    },
    {
      question: 'Investigação?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          sub: [
            {
              question: 'Investigação — registro de pressão?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 047', name: 'Registro de pressão e temperatura' },
                  ],
                },
                {
                  label: 'Cabo elétrico',
                  packages: [
                    { id: 'ABAN 104', name: 'Registro de pressão — cabo elétrico' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 147', name: 'Flexitubo - Registro de pressão' },
                  ],
                },
                {
                  label: 'Contingência — Arame',
                  packages: [
                    { id: 'ABAN 047', name: 'Registro de pressão e temperatura', isContingency: true },
                  ],
                },
                {
                  label: 'Contingência — Cabo elétrico',
                  packages: [
                    { id: 'ABAN 104', name: 'Registro de pressão — cabo elétrico', isContingency: true },
                  ],
                },
                {
                  label: 'Contingência — Flexitubo',
                  packages: [
                    { id: 'ABAN 147', name: 'Flexitubo - Registro de pressão', isContingency: true },
                  ],
                },
              ],
            },
            {
              question: 'Investigação — fluxo pelo anular?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 100', name: 'Investigação de fluxo pelo anular' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 151', name: 'Flexitubo - Investigação de fluxo pelo anular' },
                  ],
                },
                {
                  label: 'Contingência — Arame',
                  packages: [
                    { id: 'ABAN 100', name: 'Investigação de fluxo pelo anular', isContingency: true },
                  ],
                },
                {
                  label: 'Contingência — Flexitubo',
                  packages: [
                    { id: 'ABAN 151', name: 'Flexitubo - Investigação de fluxo pelo anular', isContingency: true },
                  ],
                },
              ],
            },
            {
              question: 'Investigação — furo na COP?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 099', name: 'Investigação de furo na COP' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 152', name: 'Flexitubo - Investigação de furo na COP' },
                  ],
                },
                {
                  label: 'Contingência — Arame',
                  packages: [
                    { id: 'ABAN 099', name: 'Investigação de furo na COP', isContingency: true },
                  ],
                },
                {
                  label: 'Contingência — Flexitubo',
                  packages: [
                    { id: 'ABAN 152', name: 'Flexitubo - Investigação de furo na COP', isContingency: true },
                  ],
                },
              ],
            },
            {
              question: 'Investigação — caliper?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 111', name: 'Perfilagem caliper' },
                  ],
                },
                {
                  label: 'Contingência',
                  packages: [
                    { id: 'ABAN 111', name: 'Perfilagem caliper', isContingency: true },
                  ],
                },
              ],
            },
            {
              question: 'Investigação — imageamento?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 112', name: 'Perfilagem de imageamento' },
                  ],
                },
                {
                  label: 'Contingência',
                  packages: [
                    { id: 'ABAN 112', name: 'Perfilagem de imageamento', isContingency: true },
                  ],
                },
              ],
            },
            {
              question: 'Investigação — free point?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 251', name: 'Free point (investigação de prisão)' },
                  ],
                },
                {
                  label: 'Contingência',
                  packages: [
                    { id: 'ABAN 251', name: 'Free point (investigação de prisão)', isContingency: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Pescaria na cauda?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim',
          sub: [
            {
              question: 'Pescaria de cauda — STV F?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 049', name: 'Pescaria de STV F (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 091', name: 'Pescaria de STV F (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 137', name: 'Flexitubo - Pescaria de STV F' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — plug F?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 051', name: 'Pescaria de plug F (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 093', name: 'Pescaria de plug F (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 139', name: 'Flexitubo - Pescaria de plug F' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — BRV F?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 053', name: 'Pescaria de BRV F (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 095', name: 'Pescaria de BRV F (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 141', name: 'Flexitubo - Pescaria de BRV F' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — STV R?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 048', name: 'Pescaria de STV R (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 090', name: 'Pescaria de STV R (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 136', name: 'Flexitubo - Pescaria de STV R' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — plug R?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 050', name: 'Pescaria de plug R (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 092', name: 'Pescaria de plug R (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 138', name: 'Flexitubo - Pescaria de plug R' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — BRV R?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 054', name: 'Pescaria de BRV R (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 096', name: 'Pescaria de BRV R (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 142', name: 'Flexitubo - Pescaria de BRV R' },
                  ],
                },
              ],
            },
            {
              question: 'Pescaria de cauda — camisão?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 055', name: 'Pescaria de camisão (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  packages: [
                    { id: 'ABAN 097', name: 'Pescaria de camisão (stroker)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 134', name: 'Flexitubo - Pescaria de camisão' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      question: 'Teste de coluna com STDV?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Sim — manter instalada',
          packages: [
            { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
          ],
        },
        {
          label: 'Sim — retirar após teste',
          packages: [
            { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
            { id: 'ABAN 048', name: 'Pescaria de STV R (arame)' },
          ],
        },
      ],
    },
    {
      question: 'Operação de VGL?',
      answers: [
        {
          label: 'Não',
          active: true,
        },
        {
          label: 'Retirar',
          field: 'vglAction',
          value: 'remove',
          sub: [
            {
              question: 'Descer STV para a operação de VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
                  ],
                },
              ],
            },
            {
              question: 'Retirar camisão para a VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 055', name: 'Pescaria de camisão (arame)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 134', name: 'Flexitubo - Pescaria de camisão' },
                  ],
                },
              ],
            },
            {
              question: 'Método de pescaria da VGL?',
              answers: [
                {
                  label: 'Arame',
                  active: true,
                  field: 'vglFishingMethod',
                  value: 'wireline',
                  packages: [
                    { id: 'ABAN 056', name: 'Pescaria de VGL (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  field: 'vglFishingMethod',
                  value: 'stroker',
                  packages: [
                    { id: 'ABAN 114', name: 'Pescaria de VGL (stroker)' },
                  ],
                },
              ],
            },
            {
              question: 'Reinstalar camisão pós-VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 037', name: 'Instalação de camisão na DHSV (arame)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 126', name: 'Flexitubo - Instalação de camisão na DHSV' },
                  ],
                },
              ],
            },
            {
              question: 'Retirar STV pós-VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 048', name: 'Pescaria de STV R (arame)' },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Substituir',
          field: 'vglAction',
          value: 'replace',
          sub: [
            {
              question: 'Descer STV para a operação de VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
                  ],
                },
              ],
            },
            {
              question: 'Retirar camisão para a VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 055', name: 'Pescaria de camisão (arame)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 134', name: 'Flexitubo - Pescaria de camisão' },
                  ],
                },
              ],
            },
            {
              question: 'Método de pescaria da VGL?',
              answers: [
                {
                  label: 'Arame',
                  active: true,
                  field: 'vglFishingMethod',
                  value: 'wireline',
                  packages: [
                    { id: 'ABAN 056', name: 'Pescaria de VGL (arame)' },
                  ],
                },
                {
                  label: 'Stroker',
                  field: 'vglFishingMethod',
                  value: 'stroker',
                  packages: [
                    { id: 'ABAN 114', name: 'Pescaria de VGL (stroker)' },
                  ],
                },
              ],
              after: [
                {
                  label: '',
                  packages: [
                    { id: 'ABAN 057', name: 'Instalação de nova VGL' },
                  ],
                },
              ],
            },
            {
              question: 'Reinstalar camisão pós-VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Arame',
                  packages: [
                    { id: 'ABAN 037', name: 'Instalação de camisão na DHSV (arame)' },
                  ],
                },
                {
                  label: 'Flexitubo',
                  packages: [
                    { id: 'ABAN 126', name: 'Flexitubo - Instalação de camisão na DHSV' },
                  ],
                },
              ],
            },
            {
              question: 'Retirar STV pós-VGL?',
              answers: [
                {
                  label: 'Não',
                  active: true,
                },
                {
                  label: 'Sim',
                  packages: [
                    { id: 'ABAN 048', name: 'Pescaria de STV R (arame)' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}


const SEC_LIMP: LSec = {
  id: 'limp', label: 'LIMPEZA / CONFIRMAÇÃO', phase: 'Fase 1A', color: 'blue',
  always: [{ id: 'ABAN 222', name: 'Confirmação de limpeza do poço' }],
  decisions: [],
}

const SEC_FLOWLINES: LSec = {
  id: 'flow', label: 'FLOWLINES', phase: 'Extra Abandono', color: 'amber',
  decisions: [
    {
      question: 'Limpar flowlines?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', sub: [
          {
            // Espelha FLOWLINE_INJECT (hidrato): 171/172 ANC, 167/168 DP; firme ou
            // contingencial conforme flowlineHydrate.
            question: 'Hidrato nas flowlines?',
            answers: [
              { label: 'Não', active: true },
              { label: 'Sim', field: 'flowlineHydrate', value: 'yes', packages: [
                { id: 'ABAN 171', name: 'Dissociação hidrato — flowline prod. (ANC)', condition: 'rig_anc' },
                { id: 'ABAN 167', name: 'Dissociação hidrato — flowline prod. (DP)', condition: 'rig_dp' },
                { id: 'ABAN 172', name: 'Dissociação hidrato — flowline gas lift (ANC)', condition: 'rig_anc' },
                { id: 'ABAN 168', name: 'Dissociação hidrato — flowline gas lift (DP)', condition: 'rig_dp' },
              ]},
              { label: 'Contingência', field: 'flowlineHydrate', value: 'contingency', packages: [
                { id: 'ABAN 171', name: 'Dissociação hidrato — flowline prod. (ANC)', condition: 'rig_anc',
                  isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na flowline de produção' },
                { id: 'ABAN 167', name: 'Dissociação hidrato — flowline prod. (DP)', condition: 'rig_dp',
                  isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na flowline de produção' },
                { id: 'ABAN 172', name: 'Dissociação hidrato — flowline gas lift (ANC)', condition: 'rig_anc',
                  isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na flowline de gas lift' },
                { id: 'ABAN 168', name: 'Dissociação hidrato — flowline gas lift (DP)', condition: 'rig_dp',
                  isContingency: true, contingencyReason: 'Contingência: dissociação de hidrato na flowline de gas lift' },
              ]},
            ],
          },
          {
            question: 'Método de limpeza?',
            answers: [
              { label: 'Bombeio direto', active: true, packages: [
                { id: 'ABAN 066', name: 'Limpeza de linha — DPR/Bore 4" > FLPO' },
                { id: 'ABAN 067', name: 'Limpeza de linha — DPR/Bore 4" > XO > FLGL' },
              ]},
              { label: 'N₂ lift', packages: [
                { id: 'ABAN 254', name: 'Limpeza de Flowline(s) — N₂ Lift' },
              ]},
            ],
          },
        ]},
      ],
    },
  ],
}

const SEC_TMF: LSec = {
  id: 'tmf', label: 'PLUG TMF FINAL', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Instalar plug no TMF — anular?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim',
          packages: [
            { id: 'ABAN 213', name: 'Desassentamento parcial WO (plug anular TMF)' },
            { id: 'ABAN 250', name: 'Instalação plug no TMF (bore anular)' },
            { id: 'ABAN 024', name: 'Teste interface — bore produção' },
            { id: 'ABAN 027', name: 'Teste interface — bore anular' },
          ],
          sub: [{
            question: 'Instalar plug no TMF — produção?',
            answers: [
              { label: 'Não', active: true },
              { label: 'Sim / Conting.', packages: [
                { id: 'ABAN 249', name: 'Instalação plug no TMF (bore produção)' },
              ]},
            ],
          }],
        },
        { label: 'Contingência',
          packages: [
            { id: 'ABAN 213', name: 'Desassentamento parcial WO (plug anular TMF)' },
            { id: 'ABAN 250', name: 'Instalação plug no TMF (bore anular)' },
            { id: 'ABAN 024', name: 'Teste interface — bore produção' },
            { id: 'ABAN 027', name: 'Teste interface — bore anular' },
          ],
        },
      ],
    },
  ],
}

// Amortecimento do anular A pós-canhoneio (255) — suprimido/contingencial via killWellFase1A.
const _AMORT_POS_CANHONEIO: LDec = {
  question: 'Amortecimento do anular pós-canhoneio?',
  answers: [
    { label: 'Sim', active: true, packages: [
      { id: 'ABAN 255', name: 'Amortecimento do anular A pós-canhoneio (FCBA)' },
    ]},
    { label: 'Não — poço isolado', field: 'killWellFase1A', value: 'no' },
    { label: 'Não previsto (STDV mantida)' },
    { label: 'Contingência', field: 'killWellFase1A', value: 'contingency', packages: [
      { id: 'ABAN 255', name: 'Amortecimento do anular A pós-canhoneio (FCBA)', isContingency: true,
        contingencyReason: 'Contingência: amortecimento do anular A pós-canhoneio' },
    ]},
  ],
}

// ── FSU_TT_FT — seções específicas ─────────────────────────────────────────

// Espelha PERF_INJECT (ramo TT) + LIMPEZA_INJECT (2ª) + CSB_INJECT: canhoneio profundo
// pela tecnologia escolhida, amortecimento pós-canhoneio, limpeza e CSB primário.
const SEC_TT_BARREIRA: LSec = {
  id: 'csb1_tt', label: 'CANHONEIO + CSB PRIMÁRIO (TT)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Perfuração da coluna (TT)?',
      answers: [
        { label: 'Cabo elétrico', active: true, field: 'tubingPerfMethod', value: 'electric', packages: [
          { id: 'ABAN 101', name: 'Perfuração da coluna (tubing puncher elétrico)' },
        ]},
        { label: 'Arame (eFire)', field: 'tubingPerfMethod', value: 'wireline', packages: [
          { id: 'ABAN 045', name: 'Perfuração da coluna (eFire, arame)' },
        ]},
        { label: 'Flexitubo', field: 'tubingPerfMethod', value: 'ct', packages: [
          { id: 'ABAN 154', name: 'Flexitubo - Perfuração da coluna (tubing puncher)' },
        ]},
      ],
      afterDec: [_AMORT_POS_CANHONEIO],
    },
    { question: 'Limpeza pós-canhoneio — fluido?', answers: _AMORT_COP_ANSWERS },
    {
      question: 'CSB primário (TT)?',
      answers: [
        { label: 'STV wireline', active: true, field: 'csbPrimary', value: 'stdv', packages: [
          { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
        ]},
        { label: 'Plug wireline', field: 'csbPrimary', value: 'plug', packages: [
          { id: 'ABAN 040', name: 'Plug em nipple R 2,75"' },
        ]},
        { label: 'TAE', field: 'csbPrimary', value: 'tae', packages: [
          { id: 'ABAN 237', name: 'Instalação de TAE (CSB primário)' },
        ]},
        { label: 'Packer inflável', field: 'csbPrimary', value: 'inflatable_packer', packages: [
          { id: 'ABAN 125', name: 'Flexitubo - Jateamento (SpinCat) + Gabaritagem' },
          { id: 'ABAN 162', name: 'Flexitubo - BPP inflável' },
        ]},
      ],
    },
  ],
}

// Espelha JATEAR_INJECT + FT_CEMENT_INJECT + corte (ABAN 113, condição no_pdi):
// jateamento COP/COI, cimentação FT (single/distinct/successive × polias/equip. de
// pressão) e corte de coluna quando não há PDI.
const SEC_TT_CIMENT: LSec = {
  id: 'ciment_tt', label: 'CIMENTAÇÃO FT + CORTE (TT)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Jatear COP/COI?',
      answers: [
        { label: 'Sim', active: true, field: 'jatearCopCoi', value: 'yes', packages: [
          { id: 'ABAN 125', name: 'Flexitubo - Jateamento (SpinCat) + Gabaritagem' },
        ]},
        { label: 'Contingência', field: 'jatearCopCoi', value: 'contingency', packages: [
          { id: 'ABAN 125', name: 'Flexitubo - Jateamento (SpinCat) + Gabaritagem', isContingency: true,
            contingencyReason: 'Contingência: jateamento COP/COI com FT' },
        ]},
        { label: 'Não', field: 'jatearCopCoi', value: 'no' },
      ],
    },
    {
      question: 'Modo de cimentação FT?',
      answers: [
        { label: 'Etapa única', active: true, field: 'ttFtCementMode', value: 'single', packages: [
          { id: 'ABAN 156', name: 'Cimentação anular A c/ CR + int. COP (FT)' },
        ], sub: [{
          question: 'Avaliação de TOC (etapa única)?',
          answers: [
            { label: 'Jogo de polias', active: true, field: 'loggingMode', value: 'polias', packages: [
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none' },
              { id: 'ABAN 105', name: 'Avaliação de cimentação', transitionTechnology: 'none' },
            ]},
            { label: 'Equipamento de pressão', field: 'loggingMode', value: 'pressure_equipment', packages: [
              { id: 'ABAN 105', name: 'Avaliação de cimentação' },
            ]},
          ],
        }]},
        { label: 'Etapas distintas', field: 'ttFtCementMode', value: 'distinct', packages: [
          { id: 'ABAN 155', name: 'Cimentação anular A c/ CR (FT) — 1ª etapa' },
        ], sub: [{
          question: 'Avaliação de TOC (etapas distintas)?',
          answers: [
            { label: 'Jogo de polias', active: true, field: 'loggingMode', value: 'polias', packages: [
              { id: 'ABAN 105', name: 'Avaliação de cimentação', transitionTechnology: 'none' },
              { id: 'ABAN 157', name: 'Cimentação interior COP (FT) — 2ª etapa' },
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none' },
            ]},
            { label: 'Equipamento de pressão', field: 'loggingMode', value: 'pressure_equipment', packages: [
              { id: 'ABAN 105', name: 'Avaliação de cimentação' },
              { id: 'ABAN 157', name: 'Cimentação interior COP (FT) — 2ª etapa' },
            ]},
          ],
        }]},
        { label: 'Etapas sucessivas', field: 'ttFtCementMode', value: 'successive', packages: [
          { id: 'ABAN 155', name: 'Cimentação anular A c/ CR (FT) — 1ª etapa' },
        ], sub: [{
          question: 'Avaliação de TOC (etapas sucessivas)?',
          answers: [
            { label: 'Jogo de polias', active: true, field: 'loggingMode', value: 'polias', packages: [
              { id: 'ABAN 105', name: 'Avaliação de cimentação', transitionTechnology: 'none', isContingency: true,
                contingencyReason: 'Contingência: perfilagem de cimento se parâmetros da 1ª etapa inconclusivos' },
              { id: 'ABAN 157', name: 'Cimentação interior COP (FT) — 2ª etapa' },
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none' },
            ]},
            { label: 'Equipamento de pressão', field: 'loggingMode', value: 'pressure_equipment', packages: [
              { id: 'ABAN 105', name: 'Avaliação de cimentação', isContingency: true,
                contingencyReason: 'Contingência: perfilagem de cimento se parâmetros da 1ª etapa inconclusivos' },
              { id: 'ABAN 157', name: 'Cimentação interior COP (FT) — 2ª etapa' },
            ]},
          ],
        }]},
      ],
    },
    {
      // Espelha o campo hasPDI: Não = há PDI (corte omitido); Sim = sem PDI → corta.
      question: 'Cortar coluna abaixo do TH?',
      answers: [
        { label: 'Não — há PDI', active: true },
        { label: 'Sim — sem PDI', packages: [
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
        ]},
      ],
    },
  ],
}

const SEC_RET_FSU: LSec = {
  id: 'ret', label: 'RETIRADA DO WO', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Retirar ANM?',
      answers: [
        { label: 'Não', active: true, packages: [
          { id: 'ABAN 213', name: 'Retirada do conjunto de WO (DPR/HCR)', condition: 'rig_dp' },
          { id: 'ABAN 179', name: 'Retirada do conjunto de WO (Riser Dual Bore)', condition: 'rig_anc' },
        ]},
        { label: 'Sim', packages: [
          { id: 'ABAN 178', name: 'Desassentamento de ANM e retirada (DPR/HCR)', phase: 'Fase 1B', condition: 'rig_dp' },
          { id: 'ABAN 210', name: 'Desassentamento de ANM e retirada (Riser Dual Bore)', phase: 'Fase 1B', condition: 'rig_anc' },
          { id: 'ABAN 180', name: 'Desmobilização de FIBOP/BOPW/TRT/ANM', phase: 'Fase 1B' },
        ]},
      ],
    },
  ],
}

// ── FSU_TT_BDC — seções específicas ────────────────────────────────────────

// Espelha PERF_INJECT (TT) + LIMPEZA (2ª) + CSB_INJECT (BDC: DP força TAE; ANC segue
// csbPrimary; STDV mantida instalada pula o CSB) — barreira antes da cimentação BDC.
const SEC_BDC_BARREIRA: LSec = {
  id: 'csb1_bdc', label: 'CANHONEIO + CSB (BDC)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Perfuração da coluna (TT)?',
      answers: [
        { label: 'Cabo elétrico', active: true, field: 'tubingPerfMethod', value: 'electric', packages: [
          { id: 'ABAN 101', name: 'Perfuração da coluna (tubing puncher elétrico)' },
        ]},
        { label: 'Arame (eFire)', field: 'tubingPerfMethod', value: 'wireline', packages: [
          { id: 'ABAN 045', name: 'Perfuração da coluna (eFire, arame)' },
        ]},
        { label: 'Flexitubo', field: 'tubingPerfMethod', value: 'ct', packages: [
          { id: 'ABAN 154', name: 'Flexitubo - Perfuração da coluna (tubing puncher)' },
        ]},
      ],
      afterDec: [_AMORT_POS_CANHONEIO],
    },
    { question: 'Limpeza pós-canhoneio — fluido?', answers: _AMORT_COP_ANSWERS },
    {
      question: 'CSB primário (BDC)?',
      answers: [
        { label: 'TAE', active: true, packages: [
          { id: 'ABAN 237', name: 'Instalação de TAE (CSB primário)' },
        ]},
        { label: 'STV wireline', packages: [
          { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
        ]},
        { label: 'Plug wireline', packages: [
          { id: 'ABAN 040', name: 'Plug em nipple R 2,75"' },
        ]},
        { label: 'Mantida (STDV instalada)' },
      ],
    },
  ],
}

// Espelha BDC_FT_CONTING_INJECT + 223/224 + BDC_CEMENT_INJECT + 234 + ABAN 113 (no_pdi).
const SEC_BDC: LSec = {
  id: 'bdc', label: 'BARREIRA BDC', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Contingência TT-FT (coluna não estanque)?',
      answers: [
        { label: 'Não prevista', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 125', name: 'Flexitubo - Jateamento (SpinCat) + Gabaritagem', isContingency: true,
            contingencyReason: 'Contingência TT-FT: coluna não estanque — jateamento e cimentação com FT' },
          { id: 'ABAN 156', name: 'Cimentação anular A c/ CR + int. COP (FT)', isContingency: true,
            contingencyReason: 'Contingência TT-FT: coluna não estanque — jateamento e cimentação com FT' },
          { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none', isContingency: true,
            contingencyReason: 'Contingência TT-FT: coluna não estanque — jateamento e cimentação com FT' },
          { id: 'ABAN 105', name: 'Avaliação de cimentação', transitionTechnology: 'none', isContingency: true,
            contingencyReason: 'Contingência TT-FT: coluna não estanque — jateamento e cimentação com FT' },
        ]},
      ],
    },
    {
      question: 'Avaliação de cimentação BDC?',
      packages: [
        { id: 'ABAN 224', name: 'Bombeio direto - Circulação para resfriamento do poço (HCR/DPR)', condition: 'rig_dp' },
        { id: 'ABAN 223', name: 'Bombeio direto - Circulação para resfriamento do poço (Riser Dual Bore)', condition: 'rig_anc' },
      ],
      answers: [
        { label: 'Parâmetros', active: true, packages: [
          { id: 'ABAN 083', name: 'Bombeio direto - cimentação de COP + Anular A (parâmetros)' },
        ]},
        { label: 'Perfilagem', packages: [
          { id: 'ABAN 084', name: 'Bombeio direto - cimentação de COP + Anular A (perfilagem)' },
        ]},
      ],
      after: [{ label: 'Checagem de TOC', packages: [
        { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none' },
      ]}],
    },
    {
      question: 'Cortar coluna abaixo do TH?',
      answers: [
        { label: 'Não — há PDI', active: true },
        { label: 'Sim — sem PDI', packages: [
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
        ]},
      ],
    },
  ],
}

// ── FS1_Mec / FSU_Conv / FSU_Sup — barreiras Fase 1 ───────────────────────

// Espelha PERF_INJECT (ramo FS1: canhoneio profundo + amortecimento) + LIMPEZA (2ª).
// O CSB primário fica em seção própria (no RCMA, o CSB principal entra entre as duas).
const SEC_FS1_CANHONEIO: LSec = {
  id: 'canhoneio_fs1', label: 'CANHONEIO PROFUNDO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Perfuração profunda da coluna?',
      answers: [
        { label: 'Cabo elétrico', active: true, packages: [
          { id: 'ABAN 101', name: 'Perfuração da coluna (tubing puncher elétrico)' },
        ], sub: [_AMORT_POS_CANHONEIO] },
        { label: 'Arame (eFire)', packages: [
          { id: 'ABAN 045', name: 'Perfuração da coluna (eFire, arame)' },
        ], sub: [_AMORT_POS_CANHONEIO] },
        { label: 'Flexitubo', packages: [
          { id: 'ABAN 154', name: 'Flexitubo - Perfuração da coluna (tubing puncher)' },
        ], sub: [_AMORT_POS_CANHONEIO] },
        { label: 'Não perfurar' },
      ],
    },
    { question: 'Limpeza pós-canhoneio — fluido?', answers: _AMORT_COP_ANSWERS },
  ],
}

// Espelha FS1_CSB_PRIMARY_INJECT (TAE/STV/plug/cimento FT/eCSB).
const SEC_FS1_CSB1: LSec = {
  id: 'csb1_fs1', label: 'CSB PRIMÁRIO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'CSB Primário já instalado?',
      answers: [
        { label: 'Sim' },
        { label: 'Não', active: true, sub: [{
          question: 'Tipo de CSB Primário?',
          answers: [
            { label: 'TAE', active: true, packages: [
              { id: 'ABAN 237', name: 'Instalação de TAE (CSB primário)' },
            ]},
            { label: 'STV wireline', packages: [
              { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
            ]},
            { label: 'Plug wireline', packages: [
              { id: 'ABAN 040', name: 'Plug em nipple R 2,75"' },
              { id: 'ABAN 220', name: 'Teste influxo c/ N₂ (plug) — Riser Dual Bore', condition: 'rig_anc' },
              { id: 'ABAN 221', name: 'Teste influxo c/ N₂ (plug) — DPR', condition: 'rig_dp' },
            ]},
            { label: 'Cimento FT', packages: [
              { id: 'ABAN 156', name: 'Cimentação anular A c/ CR + int. COP (FT)' },
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias', transitionTechnology: 'none' },
            ]},
            { label: 'eCSB bombeio', packages: [
              { id: 'ABAN 079', name: 'Bombeio direto — obturação c/ fluido eCSB', transitionTechnology: 'none' },
            ]},
          ],
        }]},
      ],
    },
  ],
}

// Espelha ABAN 113 (condição stuck_risk) + FS1_CSB_SECONDARY_INJECT (canhoneio raso + CSB 2).
const _FS1_RASO_DEC: LDec = {
  question: 'Canhoneio raso da coluna?',
  answers: [
    { label: 'Cabo elétrico', active: true, packages: [
      { id: 'ABAN 101', name: 'Perfuração da coluna (tubing puncher elétrico)' },
    ]},
    { label: 'Arame (eFire)', packages: [
      { id: 'ABAN 045', name: 'Perfuração da coluna (eFire, arame)' },
    ]},
    { label: 'Flexitubo', packages: [
      { id: 'ABAN 154', name: 'Flexitubo - Perfuração da coluna (tubing puncher)' },
    ]},
    { label: 'Não' },
  ],
}
const _fs1Csb2Tipo = (conting: boolean): LDec => ({
  question: 'Tipo de CSB Secundário?',
  answers: [
    { label: 'TAE', packages: [
      { id: 'ABAN 237', name: 'Instalação de TAE (CSB secundário)',
        ...(conting ? { isContingency: true, contingencyReason: 'Contingência: instalação de TAE como CSB 2' } : {}) },
    ]},
    { label: 'Plug TH', active: true, packages: [
      { id: 'ABAN 042', name: 'Plug 3,75" no TH',
        ...(conting ? { isContingency: true, contingencyReason: 'Contingência: instalação de plug TH como CSB 2' } : {}) },
    ]},
  ],
})
const SEC_FS1_CORTE_CSB2: LSec = {
  id: 'csb2_fs1', label: 'CORTE + CSB SECUNDÁRIO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Risco de aprisionamento de coluna?',
      answers: [
        { label: 'Não / N.A.', active: true },
        { label: 'Sim', packages: [
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
        ]},
        { label: 'Contingência', packages: [
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)', isContingency: true,
            contingencyReason: 'Corte preventivo de coluna marcado como contingência pelo projetista' },
        ]},
      ],
    },
    {
      question: 'CSB secundário (FS1)?',
      answers: [
        { label: 'Não previsto' },
        { label: 'Executar', active: true, sub: [_FS1_RASO_DEC, _fs1Csb2Tipo(false)] },
        { label: 'Contingência', field: 'fs1CsbSecondaryMode', value: 'contingency', sub: [_FS1_RASO_DEC, _fs1Csb2Tipo(true)] },
      ],
    },
  ],
}

const SEC_RET_CONV: LSec = {
  id: 'ret_conv', label: 'RETIRADA DO WO + ANM', phase: 'Fase 1B', color: 'blue',
  decisions: [{
    question: 'Retirar ANM?',
    answers: [
      { label: 'Sim', active: true, packages: [
        { id: 'ABAN 178', name: 'Desassentamento de ANM e retirada (DPR/HCR)', condition: 'rig_dp' },
        { id: 'ABAN 210', name: 'Desassentamento de ANM e retirada (Riser Dual Bore)', condition: 'rig_anc' },
        { id: 'ABAN 180', name: 'Desmobilização de FIBOP/BOPW/TRT/ANM' },
      ]},
      { label: 'Não' },
    ],
  }],
}

// ── FSU_Conv_RCMA — CSB principal antes das barreiras FS1 ──────────────────

// Espelha RCMA_CSB_PRINCIPAL_INJECT: só o tampão de cimento emite pacotes (os
// selecionados em rcmaCementPkgs, na ordem canônica); Não Surgência e Fluido+CSB
// não geram pacote aqui (o fluido eCSB apenas suprime perfuração/CSB 2 no fluxo FS1).
const _RCMA_CEMENT_ORDER: { id: string; name: string }[] = [
  { id: 'ABAN 159', name: 'Flexitubo - Cimentação Interior da COP' },
  { id: 'ABAN 160', name: 'Flexitubo - Cimentação Interior de revestimento a mar aberto' },
  { id: 'ABAN 078', name: 'Bombeio direto - obturação com tampões de combate a perda' },
  { id: 'ABAN 079', name: 'Bombeio direto - obturação de reservatório e preenchimento' },
  { id: 'ABAN 080', name: 'Bombeio direto - cimentação de COP' },
  { id: 'ABAN 081', name: 'Bombeio direto - cimentação Formação/tela + COP + Anular A (parâmetros)' },
  { id: 'ABAN 082', name: 'Bombeio direto - cimentação Formação/tela + COP + Anular A (perfilagem)' },
  { id: 'ABAN 083', name: 'Bombeio direto - cimentação de COP + Anular A (parâmetros)' },
  { id: 'ABAN 084', name: 'Bombeio direto - cimentação de COP + Anular A (perfilagem)' },
]
const SEC_RCMA_PRINCIPAL: LSec = {
  id: 'rcma_principal', label: 'CSB PRINCIPAL (RCMA)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Tipo de CSB Principal RCMA?',
      answers: [
        { label: 'Não Surgência', active: true },
        { label: 'Fluido + CSB' },
        { label: 'Tampão de cimento',
          sub: _RCMA_CEMENT_ORDER.map(pkg => ({
            question: `Cimentação RCMA — incluir ${pkg.id}?`,
            answers: [
              { label: 'Não', active: true },
              { label: 'Sim', field: 'rcmaCementPkgs', value: pkg.id, packages: [pkg] },
            ],
          })),
        },
      ],
    },
  ],
}

// ── FASE 2 — seções ─────────────────────────────────────────────────────────

const SEC_BOP_INSTALA: LSec = {
  id: 'bop_instala', label: 'BOP — INSTALAÇÃO', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 184', name: 'Descida e instalação do BOP de perfuração' },
  ],
  decisions: [
    {
      question: 'Limpeza FEJAT antes do BOP?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 227', name: 'Limpeza do housing com FEJAT' },
        ]},
      ],
    },
    {
      question: 'Método de teste do BOP?',
      answers: [
        { label: 'Test plug', active: true, packages: [
          { id: 'ABAN 228', name: 'Teste de BOP — test plug' },
        ]},
        { label: 'Ponteira ORMAN', packages: [
          { id: 'ABAN 240', name: 'Teste de BOP — ponteira ORMAN (FS2)' },
        ]},
        { label: 'Coluna flutuada', packages: [
          { id: 'ABAN 229', name: 'Teste de BOP — coluna flutuada (FS2)' },
        ]},
        { label: 'FETH no TH' },
      ],
    },
  ],
}

// Corte de COP/COI (modo BOP) — espelha COP_CUT_INJECT: THRT (186) → plug TH (052,
// opcional) → free point (251) → corte pelo método → retirada com THRT (190).
// O ramo inteiro é firme ou contingencial conforme fs2CopCutContingency.
const _FS2_CUT_REASON = 'Contingência: corte de COP/COI após falha de desassentamento do TH'
const _fs2CutPkg = (id: string, name: string, conting: boolean, extra?: Partial<LPkg>): LPkg => ({
  id, name,
  ...(conting ? { isContingency: true, contingencyReason: _FS2_CUT_REASON } : {}),
  ...extra,
})
const _fs2CutBranch = (conting: boolean): Pick<LAns, 'packages' | 'sub'> => ({
  packages: [_fs2CutPkg('ABAN 186', 'Descida de THRT (modo BOP)', conting)],
  sub: [
    {
      question: 'Retirar plug 3,75" no TH (Fase 2)?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'fs2ThPlugRemoval', value: 'yes', packages: [
          _fs2CutPkg('ABAN 052', 'Retirada de plug 3,75" no TH', conting),
        ]},
        { label: 'Contingência', field: 'fs2ThPlugRemoval', value: 'contingency', packages: [
          { id: 'ABAN 052', name: 'Retirada de plug 3,75" no TH', isContingency: true,
            contingencyReason: 'Contingência: retirada de plug 3,75" no TH antes do free point' },
        ]},
      ],
    },
    {
      question: 'Método de corte da COP/COI?',
      packages: [_fs2CutPkg('ABAN 251', 'Free point (investigação de prisão)', conting)],
      answers: [
        { label: 'Cabo elétrico', active: true, field: 'fs2CopCutMethod', value: 'electric', packages: [
          _fs2CutPkg('ABAN 113', 'Corte de coluna (cortador mecânico)', conting),
        ]},
        { label: 'Flexitubo', field: 'fs2CopCutMethod', value: 'ct', packages: [
          _fs2CutPkg('ABAN 121', 'Flexitubo - Montagem e teste da unidade sobre Terminal Head - Bore de produção', conting, { condition: 'rig_anc' }),
          _fs2CutPkg('ABAN 119', 'Flexitubo - Montagem e teste da unidade sobre SFT', conting, { condition: 'rig_dp_gen' }),
          _fs2CutPkg('ABAN 150', 'Flexitubo - Corte de coluna', conting),
          _fs2CutPkg('ABAN 148', 'Flexitubo - Desmobilização (sonda LWO)', conting, { condition: 'rig_lwo' }),
          _fs2CutPkg('ABAN 161', 'Flexitubo - Desmobilização (sonda generalista)', conting, { condition: 'rig_dp_gen' }),
        ]},
        { label: 'Slip shot', field: 'fs2CopCutMethod', value: 'slip_shot', packages: [
          _fs2CutPkg('ABAN 115', 'Perfilagem/Cabo elétrico - Split shot', conting),
        ]},
        { label: 'String shot', field: 'fs2CopCutMethod', value: 'string_shot', packages: [
          _fs2CutPkg('ABAN 116', 'Perfilagem/Cabo elétrico - String shot', conting),
        ]},
      ],
      after: [{ label: 'Retirada com THRT', packages: [
        _fs2CutPkg('ABAN 190', 'Retirada de TH + COP/COI com THRT (modo BOP)', conting),
      ]}],
    },
  ],
})

const SEC_FETH_COP: LSec = {
  id: 'feth_cop', label: 'FETH + COLUNA + COP', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 185', name: 'Descida da FETH (modo BOP)' },
  ],
  decisions: [
    {
      // Espelha BOP_TEST_FETH_INJECT (após a descida da FETH, antes da retirada do TH)
      question: 'Teste do BOP com FETH apoiada no TH?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'bopTestMethod', value: 'feth_on_th', packages: [
          { id: 'ABAN 241', name: 'Teste do BOP com FETH (manobra combo)' },
        ]},
      ],
    },
    {
      question: 'Coluna presa — corte? (conting.)',
      packages: [
        { id: 'ABAN 189', name: 'Retirada de TH + COP/COI com FETH (modo BOP)' },
      ],
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'fs2CopCutContingency', value: 'yes', ..._fs2CutBranch(false) },
        { label: 'Contingência', field: 'fs2CopCutContingency', value: 'contingency', ..._fs2CutBranch(true) },
      ],
    },
  ],
}

const SEC_RCMA_F2: LSec = {
  id: 'rcma_f2', label: 'RCMA — OPERAÇÕES', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 183', name: 'Descida da FIBAP a mar aberto' },
    { id: 'ABAN 188', name: 'Retirada de BAP + TH + COP/COI com FIBAP (mar aberto)' },
  ],
  decisions: [
    {
      // Espelha COP_CUT_INJECT (RCMA, mar aberto): corte → descer FIBAP → retirar COP.
      question: 'Coluna presa — corte? (conting.)',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'fs2CopCutContingency', value: 'yes', packages: [
          { id: 'ABAN 252', name: 'Corte de coluna a mar aberto' },
          { id: 'ABAN 183', name: 'Descida da FIBAP a mar aberto' },
          { id: 'ABAN 188', name: 'Retirada de BAP + TH + COP/COI com FIBAP (mar aberto)' },
        ]},
        { label: 'Contingência', field: 'fs2CopCutContingency', value: 'contingency', packages: [
          { id: 'ABAN 252', name: 'Corte de coluna a mar aberto', isContingency: true, contingencyReason: _FS2_CUT_REASON },
          { id: 'ABAN 183', name: 'Descida da FIBAP a mar aberto', isContingency: true, contingencyReason: _FS2_CUT_REASON },
          { id: 'ABAN 188', name: 'Retirada de BAP + TH + COP/COI com FIBAP (mar aberto)', isContingency: true, contingencyReason: _FS2_CUT_REASON },
        ]},
      ],
    },
    {
      // Espelha RCMA_CEMENT_LOG_INJECT (gate: bopPwcPreLog !== false); a mar aberto,
      // cabo desce direto — sem montagem de terminal head/SFT (transitionTechnology none).
      question: 'Avaliação de cimento antes do bombeio (RCMA)?',
      answers: [
        { label: 'Sim (padrão)', active: true, packages: [
          { id: 'ABAN 107', name: 'Perfilagem/Cabo elétrico - Avaliação de cimentação a mar aberto (through casing, sem coluna guia)', transitionTechnology: 'none' },
        ]},
        { label: 'Não' },
      ],
    },
  ],
}

const SEC_CAUDA: LSec = {
  id: 'cauda', label: 'PESCARIA DE CAUDA', phase: 'Fase 2', color: 'amber',
  decisions: [
    {
      question: 'Pescaria de cauda intermediária?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 191', name: 'Pescaria de cauda — overshot' },
          { id: 'ABAN 193', name: 'Conting.: corte de cauda intermediária' },
          { id: 'ABAN 194', name: 'Conting.: estampagem de cauda' },
        ]},
      ],
    },
  ],
}

const SEC_PACKER_FISHING: LSec = {
  id: 'packer', label: 'PESCARIA DE PACKER', phase: 'Fase 2', color: 'amber',
  decisions: [
    {
      // Espelha PACKER_FISHING_INJECT: 192 firme/contingencial conforme o input;
      // corte (193) e estampagem (194) sempre contingenciais.
      question: 'Pescaria de packer?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', field: 'fs2PackerFishing', value: 'yes', packages: [
          { id: 'ABAN 192', name: 'Pescaria de packer — overshot específico' },
          { id: 'ABAN 193', name: 'Conting.: corte de packer c/ sapata de lavagem',
            isContingency: true, contingencyReason: 'Contingência: corte de packer c/ sapata de lavagem / estampagem' },
          { id: 'ABAN 194', name: 'Conting.: estampagem de packer',
            isContingency: true, contingencyReason: 'Contingência: corte de packer c/ sapata de lavagem / estampagem' },
        ]},
        { label: 'Contingência', field: 'fs2PackerFishing', value: 'contingency', packages: [
          { id: 'ABAN 192', name: 'Pescaria de packer — overshot específico',
            isContingency: true, contingencyReason: 'Contingência: pescaria de packer' },
          { id: 'ABAN 193', name: 'Conting.: corte de packer c/ sapata de lavagem',
            isContingency: true, contingencyReason: 'Contingência: corte de packer c/ sapata de lavagem / estampagem' },
          { id: 'ABAN 194', name: 'Conting.: estampagem de packer',
            isContingency: true, contingencyReason: 'Contingência: corte de packer c/ sapata de lavagem / estampagem' },
        ]},
      ],
    },
  ],
}

// Espelha ISOLATION_INJECT da engine (isolamento único): pré-avaliação (bopPwcPreLog,
// exceto RCMA) → sem correção (tampão BPP/pata de mula) OU correção convencional
// (233 conting. + 103 + 202 + 200) OU PWC (231 + 200; 200 contingencial quando a
// validação é por parâmetros). Resolvido de inputs.isolations[0] pela logicEngine.
const SEC_ISOLATION: LSec = {
  id: 'isolation', label: 'ISOLAMENTO — TAMPÃO', phase: 'Fase 2', color: 'amber',
  decisions: [
    {
      question: 'Avaliação de cimento antes do tampão?',
      answers: [
        { label: 'Sim (padrão)', active: true, packages: [
          { id: 'ABAN 106', name: 'Perfilagem de cimentação — cabo elétrico' },
        ]},
        { label: 'Não' },
      ],
    },
    {
      question: 'Precisa correção de cimentação?',
      answers: [
        { label: 'Não', active: true, sub: [{
          question: 'Tipo de tampão de isolamento?',
          answers: [
            { label: 'BPP', active: true, packages: [
              { id: 'ABAN 199', name: 'Coluna de trabalho - BPP + Tampão de cimento' },
            ]},
            { label: 'Pata de Mula', packages: [
              { id: 'ABAN 200', name: 'Coluna de trabalho - Tampão de cimento com pata de mula' },
            ]},
          ],
        }]},
        { label: 'Convencional', packages: [
          { id: 'ABAN 233', name: 'Coluna de trabalho - Condicionamento do revestimento',
            isContingency: true, contingencyReason: 'Contingência: condicionamento do revestimento após avaliação de cimentação' },
          { id: 'ABAN 103', name: 'Perfilagem/Cabo elétrico - Perfuração de revestimento/liner em modo BOP' },
          { id: 'ABAN 202', name: 'Coluna de trabalho - Recimentação/correção de cimento com CR' },
          { id: 'ABAN 200', name: 'Coluna de trabalho - Tampão de cimento com pata de mula' },
        ]},
        { label: 'PWC — validação por parâmetros', packages: [
          { id: 'ABAN 231', name: 'Coluna de trabalho - Complemento/Correção de cimentação com PWC' },
          { id: 'ABAN 200', name: 'Coluna de trabalho - Tampão de cimento com pata de mula',
            isContingency: true, contingencyReason: 'Contingência: tampão final após correção de cimentação PWC' },
        ]},
        { label: 'PWC — validação por perfilagem', packages: [
          { id: 'ABAN 231', name: 'Coluna de trabalho - Complemento/Correção de cimentação com PWC' },
          { id: 'ABAN 200', name: 'Coluna de trabalho - Tampão de cimento com pata de mula' },
        ]},
      ],
    },
  ],
}

const SEC_BOP_RETIRA: LSec = {
  id: 'bop_retira', label: 'BOP — RETIRADA', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 230', name: 'Efetuar teste de influxo do CSB permanente' },
    { id: 'ABAN 236', name: 'Troca de fluido do riser' },
    { id: 'ABAN 203', name: 'BOP — Preparação e retirada' },
  ],
  decisions: [],
}

// ── MONTAGEM DOS ESCOPOS ────────────────────────────────────────────────────

// Bloco E — Acesso inicial e amortecimento (Fase 1A): DHSV/blocos ANM + anular/camisão.
// Compartilhado por todos os escopos de Fase Única (FSU) e Fase 1 (FS1).
export const BLK_ACESSO_AMORTEC_ID = 'BLK_ACESSO_AMORTEC'
const SEC_ACESSO_AMORTEC_REF: LSec = {
  id: 'acesso_amortec', label: 'ACESSO INICIAL E AMORTECIMENTO', phase: 'Fase 1A', color: 'blue',
  decisions: [], ref: { scopeId: BLK_ACESSO_AMORTEC_ID, label: 'ACESSO INICIAL E AMORTECIMENTO' },
}

// MOB v2 (conjunto no fundo / modo ANM) — editar BLK_MOB_DESCIDA_DP_COND_V2 propaga para todos.
// Acesso inicial e amortecimento via bloco `ref` — editar BLK_ACESSO_AMORTEC propaga para todos.
const F1_PREFIX: LSec[] = [SEC_MOB_REF_V2, SEC_ACESSO_AMORTEC_REF]
const F1_SUFFIX: LSec[] = [SEC_FLOWLINES, SEC_TMF]

// ── BLOCOS REUTILIZÁVEIS (BLK_) — subsequências fatoradas via `ref` vivo ─────
// Cada bloco encapsula uma sequência de seções repetida em vários escopos. No escopo,
// um único placeholder `ref` (SEC_*_REF) expande para as seções do bloco (expandScopeRefs
// ao consumir). Editar o bloco no editor visual propaga para todos os usos. Semanticamente
// idêntico à sequência inline anterior (as seções eram a mesma referência de objeto).

// Bloco A — Corte Mecânico FS1: canhoneio → CSB primário → limpeza → corte CSB2.
export const BLK_CORTE_MEC_FS1_ID = 'BLK_CORTE_MEC_FS1'
const SEC_CORTE_MEC_FS1_REF: LSec = {
  id: 'corte_mec_fs1', label: 'CORTE MECÂNICO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [], ref: { scopeId: BLK_CORTE_MEC_FS1_ID, label: 'CORTE MECÂNICO (FS1)' },
}

// Bloco B — Mobilização de Fase 2 (DP + ANC).
export const BLK_MOB_FS2_ID = 'BLK_MOB_FS2'
const SEC_MOB_FS2_REF: LSec = {
  id: 'mob', label: 'MOBILIZAÇÃO (Fase 2)', phase: 'Fase 0', color: 'gray',
  decisions: [], ref: { scopeId: BLK_MOB_FS2_ID, label: 'MOBILIZAÇÃO (Fase 2)' },
}

// Bloco C1 — Instalação do BOP (separado da retirada de coluna).
export const BLK_BOP_INSTALA_ID = 'BLK_BOP_INSTALA'
const SEC_BOP_INSTALA_REF: LSec = {
  id: 'bop_instala_ref', label: 'BOP — INSTALAÇÃO', phase: 'Fase 2', color: 'amber',
  decisions: [], ref: { scopeId: BLK_BOP_INSTALA_ID, label: 'BOP — INSTALAÇÃO' },
}

// Bloco C2 — Retirada de coluna (FETH + COLUNA + COP).
export const BLK_RET_COLUNA_ID = 'BLK_RET_COLUNA'
const SEC_RET_COLUNA_REF: LSec = {
  id: 'ret_coluna_ref', label: 'RETIRADA DE COLUNA (FETH + COP)', phase: 'Fase 2', color: 'amber',
  decisions: [], ref: { scopeId: BLK_RET_COLUNA_ID, label: 'RETIRADA DE COLUNA' },
}

// Bloco D1 — Isolamento/tampão (separado da retirada do BOP).
export const BLK_ISOLAMENTO_ID = 'BLK_ISOLAMENTO'
const SEC_ISOLAMENTO_REF: LSec = {
  id: 'isolamento_ref', label: 'ISOLAMENTO — TAMPÃO', phase: 'Fase 2', color: 'amber',
  decisions: [], ref: { scopeId: BLK_ISOLAMENTO_ID, label: 'ISOLAMENTO — TAMPÃO' },
}

// Bloco D2 — Retirada do BOP.
export const BLK_BOP_RETIRA_ID = 'BLK_BOP_RETIRA'
const SEC_BOP_RETIRA_REF: LSec = {
  id: 'bop_retira_ref', label: 'BOP — RETIRADA', phase: 'Fase 2', color: 'amber',
  decisions: [], ref: { scopeId: BLK_BOP_RETIRA_ID, label: 'BOP — RETIRADA' },
}

export const LOGIC_BY_SCOPE: Record<string, LSec[]> = {
  FSU_TT_FT: [
    ...F1_PREFIX,
    SEC_TT_BARREIRA, SEC_LIMP, SEC_TT_CIMENT,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FSU_TT_BDC: [
    ...F1_PREFIX,
    SEC_BDC_BARREIRA, SEC_LIMP, SEC_BDC,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FS1_Mec: [
    ...F1_PREFIX,
    SEC_CORTE_MEC_FS1_REF,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FSU_Conv_BOP: [
    ...F1_PREFIX,
    SEC_CORTE_MEC_FS1_REF,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  FSU_Conv_RCMA: [
    ...F1_PREFIX,
    SEC_FS1_CANHONEIO, SEC_RCMA_PRINCIPAL, SEC_FS1_CSB1, SEC_LIMP, SEC_FS1_CORTE_CSB2,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_RCMA_F2, SEC_ISOLATION,
  ],
  FSU_Sup_COP: [
    ...F1_PREFIX,
    SEC_CORTE_MEC_FS1_REF,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_CAUDA, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  FSU_Sup_PWC: [
    ...F1_PREFIX,
    SEC_CORTE_MEC_FS1_REF,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_CAUDA, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  FS2_Conv_BOP: [
    SEC_MOB_FS2_REF,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_PACKER_FISHING, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  FS2_Conv_RCMA: [
    SEC_MOB_FS2_REF,
    SEC_RCMA_F2, SEC_PACKER_FISHING, SEC_ISOLATION,
  ],
  FS2_Sup_COP: [
    SEC_MOB_FS2_REF,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_CAUDA, SEC_PACKER_FISHING, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  FS2_Sup_PWC: [
    SEC_MOB_FS2_REF,
    SEC_BOP_INSTALA_REF, SEC_RET_COLUNA_REF, SEC_CAUDA, SEC_PACKER_FISHING, SEC_ISOLAMENTO_REF, SEC_BOP_RETIRA_REF,
  ],
  // Bloco de MOB por condicionais de sonda (rig_dp/rig_anc), incluído via `ref` no início
  // dos escopos de Fase Única/FS1. Não é escopo selecionável no gerador (BLK_).
  [BLK_MOB_DESCIDA_DP_COND_ID]: [SEC_MOB_DESCIDA_DP_COND],
  // V2: bloco com "Conjunto de WO no fundo?" e modo ANM — usado pelos escopos ativos.
  [BLK_MOB_DESCIDA_DP_COND_V2_ID]: [SEC_MOB_DESCIDA_DP_COND],
  // Reentrada modo ANM (premissa: conjunto navega no fundo — sem preparação/descida do WO).
  [BLK_MOB_REENTRADA_ANM_ID]: [SEC_MOB_REENTRADA_ANM],
  // Blocos fatorados de subsequências repetidas (ver definições acima).
  [BLK_ACESSO_AMORTEC_ID]: [SEC_CONEXAO, SEC_GAB],
  [BLK_CORTE_MEC_FS1_ID]: [SEC_FS1_CANHONEIO, SEC_FS1_CSB1, SEC_LIMP, SEC_FS1_CORTE_CSB2],
  [BLK_MOB_FS2_ID]: [SEC_MOB_FS2_COND],
  [BLK_BOP_INSTALA_ID]: [SEC_BOP_INSTALA],
  [BLK_RET_COLUNA_ID]: [SEC_FETH_COP],
  [BLK_ISOLAMENTO_ID]: [SEC_ISOLATION],
  [BLK_BOP_RETIRA_ID]: [SEC_BOP_RETIRA],
}

// ── VISÃO COMPLETA ─────────────────────────────────────────────────────────
// Árvore de decisão das perguntas da etapa 1 (Tipo de sonda → Fase → Escopo),
// com as respostas como RÓTULOS nas arestas. Cada folha (escopo) abre o seu
// fluxograma completo (LOGIC_BY_SCOPE), com a MOBILIZAÇÃO contida dentro dele.

// Folha = um escopo e o seu fluxograma completo (sem filtrar MOB).
export type QLeaf = { kind: 'leaf'; scopeId: string; label: string; secs: LSec[] }
// Nó de decisão = uma pergunta e os ramos rotulados para os filhos.
export type QDecision = { kind: 'decision'; question: string; branches: { label: string; child: QNode }[] }
// Cadeia = seções comuns desenhadas em sequência antes de continuar para o filho.
export type QChain = { kind: 'chain'; secs: LSec[]; child: QNode }
export type QNode = QDecision | QLeaf | QChain

// Rótulo curto de cada escopo (terminal da árvore)
const _SCOPE_LABEL: Record<string, string> = {
  FSU_TT_FT:     'TT Flexitubo (TT-FT)',
  FSU_TT_BDC:    'TT Bombeio Direto (TT-BDC)',
  FSU_Conv_BOP:  'Convencional c/ BOP',
  FSU_Conv_RCMA: 'Convencional c/ RCMA',
  FSU_Sup_COP:   'Superconv. (COP Int./Inf.)',
  FSU_Sup_PWC:   'Superconv. (Recim./PWC)',
  FS1_Mec:       'Tampões Mecânicos',
  FS2_Conv_BOP:  'Convencional c/ BOP',
  FS2_Conv_RCMA: 'Convencional c/ RCMA',
  FS2_Sup_COP:   'Superconv. (COP Int./Inf.)',
  FS2_Sup_PWC:   'Superconv. (Recim./PWC)',
}

// ── Tipo de sonda → variante de pacote ─────────────────────────────────────
// O fluxograma de cada escopo é escrito com os pacotes do lado DP (DPR/HCR, SFT).
// Sob o ramo Ancorada (ANC), troca-se cada pacote pelo equivalente ANC (Riser Dual
// Bore / Terminal Head). Mapa derivado da engine (sequenceEngine.ts) e da base
// (packages.ts: applicableRig). LWO usa riser DPR (classe DP) → sem troca.
const DP_TO_ANC: Record<string, string> = {
  // Mobilização não entra aqui: a seção MOB é trocada por inteiro (MOB-ANC × MOB-DP) em _secsForRig.
  'ABAN 011': 'ABAN 012',  // descida WO DPR/HCR → Riser Dual Bore
  'ABAN 014': 'ABAN 015',  // flush DPR/HCR → Riser Dual Bore
  'ABAN 016': 'ABAN 017',  // desalagamento N2 DPR/HCR → Riser Dual Bore
  'ABAN 031A': 'ABAN 032', // arame montagem sobre SFT → sobre TH (bore produção)
  'ABAN 085': 'ABAN 086',  // cabo elétrico montagem sobre SFT → sobre TH (bore produção)
  'ABAN 165': 'ABAN 169',  // hidrato ANM produção DPR/HCR → Riser Dual Bore
  'ABAN 166': 'ABAN 170',  // hidrato ANM anular DPR/HCR → Riser Dual Bore
  'ABAN 167': 'ABAN 171',  // hidrato FLL produção DPR/HCR → Riser Dual Bore
  'ABAN 168': 'ABAN 172',  // hidrato FLL anular DPR/HCR → Riser Dual Bore
  'ABAN 178': 'ABAN 210',  // desassent. ANM + retirada WO (DPR/HCR) → WO+ANM Riser Dual Bore
  'ABAN 213': 'ABAN 179',  // retirada WO DPR/HCR → Riser Dual Bore
  'ABAN 215': 'ABAN 209',  // fluido inibido pré-conexão DPR/HCR → Riser Dual Bore
  'ABAN 216': 'ABAN 217',  // fluido inibido pós-conexão DPR/HCR → Riser Dual Bore
  'ABAN 221': 'ABAN 220',  // teste influxo N2 (plug) DPR → Riser Dual Bore
  'ABAN 246': 'ABAN 247',  // montagem SFT → montagem Terminal Head
}

const _swapId = (id: string, rig: 'ANC' | 'DP') => (rig === 'ANC' ? DP_TO_ANC[id] ?? id : id)
const _mapPkgs = (pkgs: LPkg[] | undefined, rig: 'ANC' | 'DP') =>
  pkgs?.map(p => ({ ...p, id: _swapId(p.id, rig) }))
const _mapDec = (d: LDec, rig: 'ANC' | 'DP'): LDec => ({
  ...d,
  answers: d.answers.map(a => ({ ...a, packages: _mapPkgs(a.packages, rig), sub: a.sub?.map(s => _mapDec(s, rig)) })),
})
const _mapSec = (s: LSec, rig: 'ANC' | 'DP'): LSec => ({
  ...s, always: _mapPkgs(s.always, rig), decisions: s.decisions.map(d => _mapDec(d, rig)),
})
// Expansão estática de seções `ref` (só LOGIC_BY_SCOPE — a visão completa é estática;
// overrides do backend são tratados em logicOverrideStore.expandScopeRefs).
function _expandRefsStatic(secs: LSec[], seen: Set<string> = new Set()): LSec[] {
  const out: LSec[] = []
  for (const sec of secs) {
    const refId = sec.ref?.scopeId
    if (refId) {
      if (seen.has(refId)) continue
      out.push(..._expandRefsStatic(LOGIC_BY_SCOPE[refId] ?? [], new Set(seen).add(refId)))
    } else out.push(sec)
  }
  return out
}

function _secsForRig(scopeId: string, rig: 'ANC' | 'DP'): LSec[] {
  const secs = _expandRefsStatic(LOGIC_BY_SCOPE[scopeId] ?? [])
  // Seções específicas por sonda (rigTypes) são filtradas; as demais, sob ANC, têm os
  // pacotes trocados pelos equivalentes ANC.
  return secs
    .filter(s => !s.rigTypes || s.rigTypes.includes(rig))
    .map(s => (rig === 'ANC' && !s.rigTypes ? _mapSec(s, rig) : s))
}

function _leaf(scopeId: string, rig: 'ANC' | 'DP'): QLeaf {
  return { kind: 'leaf', scopeId, label: _SCOPE_LABEL[scopeId] ?? scopeId, secs: _secsForRig(scopeId, rig) }
}

// Decisão "Fase?" a partir de um mapa fase→escopos (difere entre sondas: LWO é restrito)
function _faseNode(map: Record<string, string[]>, rig: 'ANC' | 'DP'): QDecision {
  const fases: { key: string; label: string }[] = [
    { key: 'fase_unica', label: 'Fase Única' },
    { key: 'fase_1',     label: 'Fase 1' },
    { key: 'fase_2',     label: 'Fase 2' },
  ]
  return {
    kind: 'decision',
    question: 'Fase?',
    branches: fases
      .filter(f => (map[f.key]?.length ?? 0) > 0)
      .map(f => ({
        label: f.label,
        child: {
          kind: 'decision' as const,
          question: 'Escopo?',
          branches: map[f.key].map(s => ({ label: _SCOPE_LABEL[s] ?? s, child: _leaf(s, rig) })),
        },
      })),
  }
}

// Disponibilidade real de escopos por sonda (espelha App.tsx)
const _SCOPE_FULL: Record<string, string[]> = {
  fase_unica: ['FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC'],
  fase_1:     ['FS1_Mec'],
  fase_2:     ['FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC'],
}
const _SCOPE_LWO: Record<string, string[]> = {
  fase_unica: ['FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_RCMA'],
  fase_1:     ['FS1_Mec'],
  fase_2:     ['FS2_Conv_RCMA'],
}

// Visão completa: Tipo de sonda → Fase → Escopo → fluxograma completo do escopo.
export const LOGIC_COMPLETO_TREE: QNode = {
  kind: 'decision',
  question: 'Tipo de sonda?',
  branches: [
    { label: 'Ancorada (ANC)', child: _faseNode(_SCOPE_FULL, 'ANC') },
    { label: 'DP Generalista', child: _faseNode(_SCOPE_FULL, 'DP') },
    { label: 'LWIV (LWO)',     child: _faseNode(_SCOPE_LWO, 'DP') },
  ],
}

// ── VISÃO COMPLETO AGRUPADO ─────────────────────────────────────────────────
// Otimização: as seções comuns a vários escopos de uma mesma fase aparecem UMA
// vez (cadeia), e a pergunta "Escopo?" é feita só no ponto de divergência —
// após GABARITAGEM/ANULAR (Fase Única/1) ou após a MOBILIZAÇÃO (Fase 2).
// O prefixo comum é o LCP (maior prefixo comum) das seções dos escopos da fase.

function _faseScopesGrouped(scopes: string[], rig: 'ANC' | 'DP'): QNode {
  const list = scopes.map(s => _secsForRig(s, rig))
  if (scopes.length === 1) {
    return { kind: 'leaf', scopeId: scopes[0], label: _SCOPE_LABEL[scopes[0]] ?? scopes[0], secs: list[0] }
  }
  // LCP por id de seção (as seções do prefixo são idênticas entre os escopos da fase)
  const minLen = Math.min(...list.map(s => s.length))
  let k = 0
  while (k < minLen && list.every(s => s[k].id === list[0][k].id)) k++
  const escopo: QDecision = {
    kind: 'decision',
    question: 'Escopo?',
    branches: scopes.map((s, i) => ({
      label: _SCOPE_LABEL[s] ?? s,
      child: { kind: 'leaf' as const, scopeId: s, label: _SCOPE_LABEL[s] ?? s, secs: list[i].slice(k) },
    })),
  }
  return k > 0 ? { kind: 'chain', secs: list[0].slice(0, k), child: escopo } : escopo
}

function _faseNodeGrouped(map: Record<string, string[]>, rig: 'ANC' | 'DP'): QDecision {
  const fases: { key: string; label: string }[] = [
    { key: 'fase_unica', label: 'Fase Única' },
    { key: 'fase_1',     label: 'Fase 1' },
    { key: 'fase_2',     label: 'Fase 2' },
  ]
  return {
    kind: 'decision',
    question: 'Fase?',
    branches: fases
      .filter(f => (map[f.key]?.length ?? 0) > 0)
      .map(f => ({ label: f.label, child: _faseScopesGrouped(map[f.key], rig) })),
  }
}

export const LOGIC_COMPLETO_GROUPED_TREE: QNode = {
  kind: 'decision',
  question: 'Tipo de sonda?',
  branches: [
    { label: 'Ancorada (ANC)', child: _faseNodeGrouped(_SCOPE_FULL, 'ANC') },
    { label: 'DP Generalista', child: _faseNodeGrouped(_SCOPE_FULL, 'DP') },
    { label: 'LWIV (LWO)',     child: _faseNodeGrouped(_SCOPE_LWO, 'DP') },
  ],
}

// Compatibilidade retroativa — AdminView e outros consumidores que importam LOGIC_SECS
export const LOGIC_SECS: LSec[] = LOGIC_BY_SCOPE.FSU_TT_FT
