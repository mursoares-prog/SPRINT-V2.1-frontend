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

// ─────────────────────────────────────────────────────────────────────────────
// NOTA: as árvores de lógica (escopos e blocos) NÃO vivem mais neste arquivo.
// Foram migradas para o banco (tabela logic_scope_overrides) e são geridas via
// admin no editor de Árvores de Decisão. Este módulo mantém apenas os TIPOS e
// utilitários (LSec, LDec, LAns, LPkg, LSeqEntry, LCondition, LPkgPhase,
// conditionMatches, CONDITION_LABELS) usados por toda a base.
// Fonte das seções em runtime: src/data/logicOverrideStore.ts (resolveScopeSections).
