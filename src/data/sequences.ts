import type { ScopeId, Phase, Technology } from '../types'

export interface SequenceStep {
  packageId: string
  phase: Phase
  isContingency?: boolean
  contingencyReason?: string
  condition?: 'no_pdi' | 'stuck_risk' | 'clean_flowlines' | 'remove_anm' | 'not_remove_anm' | 'dhsv_no_sleeve' | 'transponder_cot' | 'transponder_rov' | 'fejat'
  transitionTechnology?: Technology
}

export interface ScopeSequence {
  ANC: SequenceStep[]
  DP: SequenceStep[]
}

// Marcador: após mob, engine injeta remoção de CCAP conforme inputs
const POST_MOB: SequenceStep = { packageId: 'POST_MOB_INJECT', phase: 'Fase 0' }

// Marcador: engine injeta retirada de TCap após descida do WO (nunca antes da TRT)
const TCAP_STEP: SequenceStep = { packageId: 'TCAP_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta pacotes de limpeza de linhas conforme inputs (fase própria, reverte após)
const FLOWLINE_STEP: SequenceStep = { packageId: 'FLOWLINE_INJECT', phase: 'Extra Abandono', condition: 'clean_flowlines' }

// Marcador: ANC sem TCap → flush (ABAN 015) + fluido; ANC com TCap → pula (flush/fluido adicionados em TCAP_INJECT após desassentamento); DP → só fluido
const RISER_FLUID_STEP: SequenceStep = { packageId: 'RISER_FLUID_INJECT', phase: 'Fase 1A' }

// Marcadores: recuperação de plugs (TMF/TH) e instalação de camisão após gabaritagem
const PLUG_STEP:    SequenceStep = { packageId: 'PLUG_INJECT',   phase: 'Fase 1A' }
const CAMISAO_STEP: SequenceStep = { packageId: 'CAMISAO_INJECT', phase: 'Fase 1A' }

// Marcador: desmonta a tecnologia ativa sem montar outra (evita phantom mount+dismount)
const DISMOUNT_STEP: SequenceStep = { packageId: 'DISMOUNT_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta ABAN 063/064/065 conforme envelope do anular A
const ANULAR_A_STEP: SequenceStep = { packageId: 'ANULAR_A_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta CSB primário (STDV/plug/TAE/packer) com transição de tech
const CSB_STEP: SequenceStep = { packageId: 'CSB_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta cimentação FT (params → ABAN 156+232 | logging → ABAN 155+105+157+234)
const FT_CEMENT_STEP: SequenceStep = { packageId: 'FT_CEMENT_INJECT', phase: 'Fase 1A' }

// Marcadores FS1_Mec: CSB primário (TAE / tampão mecânico / cimento FT / cimento direto) e secundário
const FS1_CSB_PRIMARY_STEP: SequenceStep   = { packageId: 'FS1_CSB_PRIMARY_INJECT',   phase: 'Fase 1A' }
const FS1_CSB_SECONDARY_STEP: SequenceStep = { packageId: 'FS1_CSB_SECONDARY_INJECT', phase: 'Fase 1A' }
// Marcador RCMA: CSB principal (Não Surgência / Fluido e CSB / Tampão de cimento)
const RCMA_CSB_PRINCIPAL_STEP: SequenceStep = { packageId: 'RCMA_CSB_PRINCIPAL_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta plug no TMF ao final, após limpeza de flowlines (se previsto)
const TMF_PLUG_END_STEP: SequenceStep = { packageId: 'TMF_PLUG_END_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta ABAN 083 (params) ou ABAN 084 (logging) para BDC
const BDC_CEMENT_STEP: SequenceStep = { packageId: 'BDC_CEMENT_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta contingência de escopo TT-FT caso coluna não estanque (TT-BDC)
const BDC_FT_CONTING_STEP: SequenceStep = { packageId: 'BDC_FT_CONTING_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta ABAN 206 (Montagem de ITF) apenas para sonda LWO
const ITF_INJECT: SequenceStep = { packageId: 'ITF_INJECT', phase: 'Fase 1A' }
// Marcador: engine injeta pescaria/instalação de VGL conforme inputs.vglAction
const VGL_INJECT: SequenceStep = { packageId: 'VGL_INJECT', phase: 'Fase 1A' }
// Marcador: engine injeta perfilagens de investigação após gabaritagem da coluna
const INVESTIGATION_INJECT: SequenceStep = { packageId: 'INVESTIGATION_INJECT', phase: 'Fase 1A' }

// Mobilização
const MOB_ANC: SequenceStep[] = [
  { packageId: 'ABAN 208', phase: 'Fase 0' },
  POST_MOB,
]
const MOB_DP: SequenceStep[] = [
  { packageId: 'ABAN 002', phase: 'Fase 0', condition: 'transponder_rov' },
  { packageId: 'ABAN 001', phase: 'Fase 0', condition: 'transponder_cot' },
  { packageId: 'ABAN 003', phase: 'Fase 0' },
  { packageId: 'ABAN 007', phase: 'Fase 0', condition: 'transponder_rov' },
  { packageId: 'ABAN 006', phase: 'Fase 0', condition: 'transponder_cot' },
  POST_MOB,
]

// Preparação e descida do conjunto de WO.
// Com TCap: ABAN 211 (prep CWO+TRT, Fase 0) + ABAN 244/245 (descida para retirada da TCap); ABAN 011/012 suprimidos.
// Sem TCap: ABAN 211 suprimido; ABAN 212 (prep CWO+TRT reentrada, Fase 1A) + ABAN 011/012 (descida).
// Guards na engine controlam a supressão conforme presença de TCap.
const DESCIDA_ANC: SequenceStep[] = [
  { packageId: 'ABAN 211', phase: 'Fase 0' },
  { packageId: 'ABAN 212', phase: 'Fase 1A' },
  { packageId: 'ABAN 012', phase: 'Fase 1A' },
  ITF_INJECT,
  RISER_FLUID_STEP,
]
const DESCIDA_DP: SequenceStep[] = [
  { packageId: 'ABAN 211', phase: 'Fase 0' },
  { packageId: 'ABAN 212', phase: 'Fase 1A' },
  { packageId: 'ABAN 011', phase: 'Fase 1A' },
  // Flush do DPR/HCR (ABAN 014) emitido em ITF_INJECT: Generalista na descida;
  // LWO após a montagem do ITF (ABAN 206), nunca antes.
  ITF_INJECT,
  RISER_FLUID_STEP,
]


// Marcador: engine injeta hidrato na ANM (ABAN 165/169 produção, ABAN 166/170 anular) após teste funcional
const ANM_HYDRATE_INJECT: SequenceStep = { packageId: 'ANM_HYDRATE_INJECT', phase: 'Fase 1A' }
// Marcador: engine injeta jateamento com FT (ABAN 125) após testes funcionais da ANM
const ANM_VALVE_INJECT: SequenceStep = { packageId: 'ANM_VALVE_INJECT', phase: 'Fase 1A' }
// Marcador: engine injeta abertura de válvula da ANM com FT (ABAN 143/124) após testes de bloco da ANM
const ANM_FORCE_INJECT: SequenceStep = { packageId: 'ANM_FORCE_INJECT', phase: 'Fase 1A' }

// Marcador: engine injeta fluido inibido pós-conexão (ABAN 217/216) após a reentrada na ANM (ABAN 023),
// quando a TCap foi disposta em superfície com fluido inibido pós-conexão.
const POST_ANM_FLUID_INJECT: SequenceStep = { packageId: 'POST_ANM_FLUID_INJECT', phase: 'Fase 1A' }

// Conexão e testes na ANM
// TCAP_STEP: engine injeta 018+019+021/022 somente se TCap selecionada e não retirada antecipadamente
// ABAN 030: somente se dhsvBrvType === 'tubing_mounted' E installCamisao === 'no'
const CONEXAO_ANM: SequenceStep[] = [
  TCAP_STEP,
  { packageId: 'ABAN 023', phase: 'Fase 1A' },
  POST_ANM_FLUID_INJECT,
  { packageId: 'ABAN 024', phase: 'Fase 1A' },
  { packageId: 'ABAN 025', phase: 'Fase 1A' },
  PLUG_STEP,
  { packageId: 'ABAN 218', phase: 'Fase 1A' },
  ANM_HYDRATE_INJECT,
  ANM_VALVE_INJECT,
  { packageId: 'ABAN 028', phase: 'Fase 1A' },
  { packageId: 'ABAN 029', phase: 'Fase 1A' },
  ANM_FORCE_INJECT,
  { packageId: 'ABAN 030', phase: 'Fase 1A', condition: 'dhsv_no_sleeve' },
  // ANULAR_A_STEP e LIMPEZA_INJECT em ARAME_GABARIT (após CONEXAO_ANM),
  // garantindo que despressurização e amortecimento só ocorram após as operações de conexão.
]

// Limpeza de flowlines (engine injeta os pacotes corretos conforme linhas e método)
const FLOWLINE_ANC: SequenceStep[] = [ FLOWLINE_STEP ]
const FLOWLINE_DP: SequenceStep[] = [ FLOWLINE_STEP ]

// Operações de arame (montagem gerenciada pelo applyTransitions — não inserir explicitamente)
const ARAME_MOUNT_ANC: SequenceStep[] = []
const ARAME_MOUNT_DP:  SequenceStep[] = []
const ARAME_GABARIT: SequenceStep[] = [
  ANULAR_A_STEP,
  { packageId: 'LIMPEZA_INJECT', phase: 'Fase 1A' },
  { packageId: 'DHSV_TEST_INJECT', phase: 'Fase 1A' },
  CAMISAO_STEP,
  INVESTIGATION_INJECT,
  { packageId: 'TAIL_FISHING_INJECT', phase: 'Fase 1A' },
  VGL_INJECT,
  { packageId: 'BRV_INSERTABLE_INJECT', phase: 'Fase 1A' },
  { packageId: 'STDV_TEST_INJECT', phase: 'Fase 1A' },
  { packageId: 'PERF_INJECT', phase: 'Fase 1A' },
]
// Marcador: engine escolhe ABAN 219 / 061 / 062 conforme initialFillFluid
const LIMPEZA_COP: SequenceStep[] = [
  { packageId: 'LIMPEZA_INJECT', phase: 'Fase 1A' },
]
// ABAN 038 (STV)/041 (plug F)/042 (plug TH)/220-221 (teste de influxo): a antiga barreira do
// superconvencional foi substituída pelo modelo CSB primário/secundário (ABAN 042 e o teste de
// influxo seguem disponíveis via FS1_CSB_PRIMARY_INJECT / fs1CsbSecondary).
const ARAME_DISMOUNT: SequenceStep[] = [ { packageId: 'ABAN 204', phase: 'Fase 1A' } ]
const UEP_CLEAN_INJECT: SequenceStep = { packageId: 'UEP_CLEAN_INJECT', phase: 'Fase 1A' }
const CONFIRM_LIMPEZA: SequenceStep[] = [ { packageId: 'ABAN 222', phase: 'Fase 1A' } ]

// Corte de coluna (contingencial ou condicional)
const CORTE_COLUNA_COND: SequenceStep[] = [
  { packageId: 'ABAN 113', phase: 'Fase 1A', condition: 'no_pdi', isContingency: false },
]
const CORTE_COLUNA_STUCK: SequenceStep[] = [
  { packageId: 'ABAN 113', phase: 'Fase 1A', condition: 'stuck_risk' },
]

// Retirada do WO para escopos Fase Única TT e FS1 (ANM removal é opcional).
// Quando remove_anm=true, o desassentamento da ANM (210/178) marca a transição para
// Fase 1B — desmobilização (180) também vai para 1B nesse cenário.
const RETIRADA_FSU_ANC: SequenceStep[] = [
  { packageId: 'ABAN 179', phase: 'Fase 1A', condition: 'not_remove_anm' },
  { packageId: 'ABAN 210', phase: 'Fase 1B', condition: 'remove_anm' },
  { packageId: 'ABAN 180', phase: 'Fase 1B', condition: 'remove_anm' },
]
const RETIRADA_FSU_DP: SequenceStep[] = [
  { packageId: 'ABAN 213', phase: 'Fase 1A', condition: 'not_remove_anm' },
  { packageId: 'ABAN 178', phase: 'Fase 1B', condition: 'remove_anm' },
  { packageId: 'ABAN 180', phase: 'Fase 1B', condition: 'remove_anm' },
]

// Retirada do WO + ANM para escopos Conv/Sup (ANM removal obrigatória, encerra Fase 1B)
const RETIRADA_WO_ANM_ANC: SequenceStep[] = [
  { packageId: 'ABAN 210', phase: 'Fase 1B' },
  { packageId: 'ABAN 180', phase: 'Fase 1B' },
]
const RETIRADA_WO_ANM_DP: SequenceStep[] = [
  { packageId: 'ABAN 178', phase: 'Fase 1B' },
  { packageId: 'ABAN 180', phase: 'Fase 1B' },
]

// BOP de perfuração (Fase 2)
const FEJAT_CONTINGENCY: SequenceStep[] = [
  { packageId: 'ABAN 227', phase: 'Fase 2', condition: 'fejat',
    isContingency: true, contingencyReason: 'Contingência: limpeza do housing com FEJAT antes da descida do BOP' },
]
// Marcador: engine injeta teste do BOP (Test Plug / Ponteira ORMAN / Coluna flutuada conforme inputs)
const BOP_TEST_INJECT: SequenceStep = { packageId: 'BOP_TEST_INJECT', phase: 'Fase 2' }
// Marcador: engine injeta ABAN 241 quando bopTestMethod = 'feth_on_th' (após descida da FETH)
const BOP_TEST_FETH_INJECT: SequenceStep = { packageId: 'BOP_TEST_FETH_INJECT', phase: 'Fase 2' }
const BOP_INSTALA: SequenceStep[] = [
  ...FEJAT_CONTINGENCY,
  { packageId: 'ABAN 184', phase: 'Fase 2' },
  BOP_TEST_INJECT,
]
// Marcador: engine injeta corte de COP/COI após tentativa de desassentamento do TH (se previsto)
const COP_CUT_INJECT: SequenceStep = { packageId: 'COP_CUT_INJECT', phase: 'Fase 2' }
const FETH_BOP: SequenceStep[] = [
  { packageId: 'ABAN 185', phase: 'Fase 2' },
  BOP_TEST_FETH_INJECT,
  { packageId: 'ABAN 189', phase: 'Fase 2' },
  COP_CUT_INJECT,
]
// Marcador: engine injeta avaliação de cimentação a cabo (ABAN 107) antes do tampão RCMA
const RCMA_CEMENT_LOG_STEP: SequenceStep = { packageId: 'RCMA_CEMENT_LOG_INJECT', phase: 'Fase 2' }
const FIBAP_RCMA: SequenceStep[] = [
  { packageId: 'ABAN 183', phase: 'Fase 2' },
  { packageId: 'ABAN 188', phase: 'Fase 2' },
  COP_CUT_INJECT,
  RCMA_CEMENT_LOG_STEP,
]
// Marcador: engine injeta pescaria de packer (ABAN 192+193+194) se previsto
const PACKER_FISHING_INJECT: SequenceStep = { packageId: 'PACKER_FISHING_INJECT', phase: 'Fase 2' }
// Marcador: engine itera sobre inputs.isolations e gera o bloco de cimentação/correção por isolamento
const ISOLATION_INJECT: SequenceStep = { packageId: 'ISOLATION_INJECT', phase: 'Fase 2' }
const BOP_RETIRA: SequenceStep[] = [
  { packageId: 'ABAN 230', phase: 'Fase 2' },
  { packageId: 'ABAN 236', phase: 'Fase 2' },
  { packageId: 'ABAN 203', phase: 'Fase 2' },
]


// FSU TT-FT
const FSU_TT_FT_SPECIFIC: SequenceStep[] = [ CSB_STEP ]
const FSU_TT_FT_FLEXITUBO_ANC: SequenceStep[] = [
  { packageId: 'JATEAR_INJECT', phase: 'Fase 1A' },
  FT_CEMENT_STEP,
]
const FSU_TT_FT_FLEXITUBO_DP: SequenceStep[] = [
  { packageId: 'JATEAR_INJECT', phase: 'Fase 1A' },
  FT_CEMENT_STEP,
]

// FSU TT-BDC (split: CONFIRM_LIMPEZA inserida após CSB, antes do bombeio)
const FSU_TT_BDC_PRE: SequenceStep[] = [
  CSB_STEP,
]
const FSU_TT_BDC_POST_ANC: SequenceStep[] = [
  { packageId: 'ABAN 223', phase: 'Fase 1A' },
  BDC_CEMENT_STEP,
  { packageId: 'ABAN 234', phase: 'Fase 1A', transitionTechnology: 'none' },
]
const FSU_TT_BDC_POST_DP: SequenceStep[] = [
  { packageId: 'ABAN 224', phase: 'Fase 1A' },
  BDC_CEMENT_STEP,
  { packageId: 'ABAN 234', phase: 'Fase 1A', transitionTechnology: 'none' },
]

// Marcador: engine injeta ABAN 191 (pescaria de cauda c/ overshot) se previsto
const CAUDA_INTER_INJECT: SequenceStep = { packageId: 'CAUDA_INTER_INJECT', phase: 'Fase 2' }

// FSU Superconvencional
const FSU_SUP_COP: SequenceStep[] = [
  CAUDA_INTER_INJECT,
]
// FSU_SUP_PWC removido: ABAN 233 e correção agora gerados por ISOLATION_INJECT

export const SEQUENCES: Record<ScopeId, ScopeSequence> = {
  // TT-FT: CONFIRM_LIMPEZA após CSB (antes do flexitubo); flowlines antes da retirada
  FSU_TT_FT: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      ...FSU_TT_FT_SPECIFIC, ...CONFIRM_LIMPEZA, ...FSU_TT_FT_FLEXITUBO_ANC,
      ...CORTE_COLUNA_COND,
      DISMOUNT_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_FSU_ANC,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      ...FSU_TT_FT_SPECIFIC, ...CONFIRM_LIMPEZA, ...FSU_TT_FT_FLEXITUBO_DP,
      ...CORTE_COLUNA_COND,
      DISMOUNT_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_FSU_DP,
    ],
  },
  // TT-BDC: CONFIRM_LIMPEZA após CSB (antes do bombeio); flowlines antes da retirada
  FSU_TT_BDC: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      ...FSU_TT_BDC_PRE, ...CONFIRM_LIMPEZA, BDC_FT_CONTING_STEP, ...FSU_TT_BDC_POST_ANC, ...ARAME_DISMOUNT,
      ...CORTE_COLUNA_COND,
      DISMOUNT_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_FSU_ANC,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      ...FSU_TT_BDC_PRE, ...CONFIRM_LIMPEZA, BDC_FT_CONTING_STEP, ...FSU_TT_BDC_POST_DP, ...ARAME_DISMOUNT,
      ...CORTE_COLUNA_COND,
      DISMOUNT_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_FSU_DP,
    ],
  },
  // Conv/Sup: flowlines → plug TMF (se previsto) → plug TH → retirada
  FSU_Conv_BOP: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_ANC,
      ...BOP_INSTALA, ...FETH_BOP, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_DP,
      ...BOP_INSTALA, ...FETH_BOP, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
  FSU_Conv_RCMA: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      RCMA_CSB_PRINCIPAL_STEP, FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_ANC,
      ...FIBAP_RCMA, ISOLATION_INJECT,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      RCMA_CSB_PRINCIPAL_STEP, FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_DP,
      ...FIBAP_RCMA, ISOLATION_INJECT,
    ],
  },
  // Sup COP/PWC: Fase 1 alinhada ao FS1_Mec/Conv (CSB primário/secundário + perfuração profunda/rasa),
  // substituindo a antiga barreira STV (038) + plug F (041) + plug TH (042). Fase 2 (cauda/BOP) preservada.
  FSU_Sup_COP: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_ANC,
      ...BOP_INSTALA, ...FETH_BOP, ...FSU_SUP_COP, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_DP,
      ...BOP_INSTALA, ...FETH_BOP, ...FSU_SUP_COP, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
  FSU_Sup_PWC: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_ANC,
      ...BOP_INSTALA, ...FETH_BOP, CAUDA_INTER_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP, DISMOUNT_STEP,
      ...RETIRADA_WO_ANM_DP,
      ...BOP_INSTALA, ...FETH_BOP, CAUDA_INTER_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
  FS1_Mec: {
    ANC: [
      ...MOB_ANC, ...DESCIDA_ANC, ...CONEXAO_ANM,
      ...ARAME_MOUNT_ANC, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_ANC, TMF_PLUG_END_STEP,
      DISMOUNT_STEP, ...RETIRADA_FSU_ANC,
    ],
    DP: [
      ...MOB_DP, ...DESCIDA_DP, ...CONEXAO_ANM,
      ...ARAME_MOUNT_DP, ...ARAME_GABARIT, ...LIMPEZA_COP,
      FS1_CSB_PRIMARY_STEP, UEP_CLEAN_INJECT, ...CONFIRM_LIMPEZA, ...CORTE_COLUNA_STUCK, FS1_CSB_SECONDARY_STEP,
      ...FLOWLINE_DP, TMF_PLUG_END_STEP,
      DISMOUNT_STEP, ...RETIRADA_FSU_DP,
    ],
  },
  FS2_Conv_BOP: {
    ANC: [
      ...MOB_ANC,
      ...BOP_INSTALA, ...FETH_BOP, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP,
      ...BOP_INSTALA, ...FETH_BOP, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
  FS2_Conv_RCMA: {
    ANC: [
      ...MOB_ANC,
      ...FIBAP_RCMA, PACKER_FISHING_INJECT, ISOLATION_INJECT,
    ],
    DP: [
      ...MOB_DP,
      ...FIBAP_RCMA, PACKER_FISHING_INJECT, ISOLATION_INJECT,
    ],
  },
  FS2_Sup_COP: {
    ANC: [
      ...MOB_ANC,
      ...BOP_INSTALA, ...FETH_BOP, ...FSU_SUP_COP, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP,
      ...BOP_INSTALA, ...FETH_BOP, ...FSU_SUP_COP, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
  FS2_Sup_PWC: {
    ANC: [
      ...MOB_ANC,
      ...BOP_INSTALA, ...FETH_BOP, CAUDA_INTER_INJECT, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
    DP: [
      ...MOB_DP,
      ...BOP_INSTALA, ...FETH_BOP, CAUDA_INTER_INJECT, PACKER_FISHING_INJECT, ISOLATION_INJECT, ...BOP_RETIRA,
    ],
  },
}

export const SCOPE_LABELS: Record<ScopeId, string> = {
  FSU_TT_FT:    'Fase Única — TT Flexitubo (TT-FT)',
  FSU_TT_BDC:   'Fase Única — TT Bombeio Direto (TT-BDC)',
  FSU_Conv_BOP:  'Fase Única — Convencional com BOP',
  FSU_Conv_RCMA: 'Fase Única — Convencional com RCMA',
  FSU_Sup_COP:   'Fase Única — Superconvencional (COP Int./Inf.)',
  FSU_Sup_PWC:   'Fase Única — Superconvencional (Recimentação/PWC)',
  FS1_Mec:       'Fase 1A — Tampões Mecânicos',
  FS2_Conv_BOP:  'Fase 2 — Convencional com BOP',
  FS2_Conv_RCMA: 'Fase 2 — Convencional com RCMA',
  FS2_Sup_COP:   'Fase 2 — Superconvencional (COP Interior/Inferior)',
  FS2_Sup_PWC:   'Fase 2 — Superconvencional (Recimentação/PWC)',
}
