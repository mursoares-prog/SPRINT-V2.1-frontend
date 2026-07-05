export type RigType = 'ANC' | 'DP' | 'PA' | 'SPH' | 'SM' | 'SPM' | 'Rigless'
export type OperationType = 'Generalista' | 'LWO'
export type Technology = 'wireline' | 'ct' | 'electric' | 'workstring' | 'bop' | 'none'
export type Phase = 'Fase 0' | 'Fase 1A' | 'Fase 1B' | 'Fase 2' | 'Extra Abandono' | 'Mobilização' | 'Desmobilização'
export type FlowlineLine = 'flpo' | 'flgl'
export type FlowlineMethod = 'direct_pumping' | 'n2_lift'

export type BundleScopeId =
  | 'FSU_TT_FT'
  | 'FSU_TT_BDC'
  | 'FSU_Conv_BOP'
  | 'FSU_Conv_RCMA'
  | 'FSU_Sup_COP'
  | 'FSU_Sup_PWC'
  | 'FS1_Mec'
  | 'FS2_Conv_BOP'
  | 'FS2_Conv_RCMA'
  | 'FS2_Sup_COP'
  | 'FS2_Sup_PWC'

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ScopeId = BundleScopeId | (string & {})

export type SubseaEquipment =
  | 'corrosion_cap'
  | 'tree_cap'
  | 'mini_tree_cap'
  | 'anm_vertical'
  | 'anm_horizontal'
  | 'bap'
  | 'wellhead'

export type CementMethod = 'params' | 'logging' | 'perforation_test'
export type AnularAPressure = 'zero' | 'nonzero'
export type AnularFillFluid = 'diesel' | 'inhibited'
export type TcapDisposition = 'bottom' | 'surface'
export type CsbPrimary = 'stdv' | 'plug' | 'tae' | 'inflatable_packer'
export type TtFtCementMode = 'single' | 'successive' | 'distinct'
export type LoggingMode = 'polias' | 'pressure_equipment'
export type Percentile = number
export type OperationMode = 'through_tubing' | 'through_casing'
export type TmfPlugBore = 'production' | 'annular'
export type CamisaoMethod = 'wireline' | 'ct'
export type GaugeTech = 'wireline' | 'electric' | 'ct' | 'no'
export type InvestigationLog = 'registro_pressao' | 'fluxo_anular' | 'furo_cop' | 'caliper' | 'imageamento' | 'free_point'
export type TcapSurfaceFluid = 'n2' | 'inhibited_pre' | 'inhibited_post'
export type FishingElement = 'camisao' | 'stv_r' | 'stv_f' | 'plug_r' | 'plug_f' | 'brv_f' | 'brv_r'
export type FishingMethod = 'wireline' | 'stroker' | 'ct'
export interface FishingItem { element: FishingElement; method: FishingMethod }
export type VglAction = 'remove' | 'replace'
export type TubingPerfMethod = 'electric' | 'wireline' | 'ct'
export type RiserFluid = 'n2' | 'inhibited'
export type TransponderMode = 'cot' | 'rov'
export type InitialFillFluid = 'diesel_fcba' | 'inhibited' | 'diesel'
export type AnularFluid = 'diesel_fcba' | 'inhibited' | 'diesel'
export type DhsvBrvType = 'tubing_mounted' | 'insertable' | 'none'
export type Fs1CsbPrimary = 'stdv' | 'plug' | 'tae' | 'cement_plug' | 'ecsb'
export type Fs1CsbSecondary = 'plug_th' | 'tae'
export type RcmaCsbPrincipal = 'no_surge' | 'fluid_csb' | 'cement_plug'
export type RcmaCementPkg = 'ABAN 078' | 'ABAN 079' | 'ABAN 080' | 'ABAN 081' | 'ABAN 082' | 'ABAN 083' | 'ABAN 084' | 'ABAN 159' | 'ABAN 160'
// Três estados para perguntas operacionais: planejado / contingencial / não previsto
export type YesContingencyNo = 'yes' | 'contingency' | 'no'

export type IsolationPlugType = 'bpp' | 'pata_de_mula'
export type IsolationCorrMethod = 'convencional' | 'pwc'

export interface IsolationConfig {
  needsCorrection: boolean
  corrContingency?: boolean
  plugType?: IsolationPlugType
  corrMethod?: IsolationCorrMethod
  pwcValidation?: 'params' | 'perfil'
}

export interface Package {
  id: string
  name: string
  category: string
  technology: Technology
  applicableRig: RigType[]
  applicableOp: ('Generalista' | 'LWO')[]
  isMountOp?: boolean
  isDismountOp?: boolean
  noDismountAfter?: boolean
  nRuns?: number        // corridas firmes por item firme (omitir = 1)
  nContSubruns?: number // corridas contingenciais embutidas no item firme (omitir = 0)
}

export interface Duration {
  P10: number; P25: number; P50: number; P75: number; P90: number; P95: number
}

export interface ScheduleItem {
  uid: string
  packageId: string
  packageName: string
  category: string
  technology: Technology
  transitionTechnology?: Technology
  phase: Phase
  duration: number
  isContingency: boolean
  contingencyReason?: string
  autoInserted?: boolean
  annularBore?: boolean
  startDay: number
  endDay: number
}

export interface WizardInputs {
  rigType: RigType
  operationType: OperationType
  scopeId: ScopeId
  hasPDI?: boolean
  hasStuckStringRisk?: YesContingencyNo
  cementMethod?: CementMethod
  subseaEquipments: SubseaEquipment[]
  treeCapBeforeIntervention?: boolean
  corrosionCapBeforeIntervention?: boolean
  removeANM?: boolean
  cleanFlowlines: boolean
  flowlineLines?: FlowlineLine[]
  flowlineMethod?: FlowlineMethod
  flowlineHydrate?: YesContingencyNo
  flowlineHydrateLines?: FlowlineLine[]
  includeCcapBackup?: boolean
  anmHydrate?: YesContingencyNo
  anmHydrateBlocks?: ('producao' | 'anular')[]
  anmValveContingency?: ('hydrate' | 'jateamento' | 'gabarit_ft')[]
  anmForceOpen?: YesContingencyNo
  anmForceMethod?: ('hammer' | 'motor_broca')[]
  anmValveHydrateBlocks?: ('producao' | 'anular')[]
  hasTmfPlug?: boolean
  tmfPlugBores?: TmfPlugBore[]
  tmfPlugContingencyProd?: ('stroker' | 'ft')[]
  tmfPlugContingencyAnul?: ('stroker' | 'ft')[]
  hasThPlug?: boolean
  thPlugContingency?: ('stroker' | 'ft')[]
  installCamisao?: ('yes' | 'contingency' | 'no')[]
  camisaoMethod?: CamisaoMethod
  gaugeTech?: GaugeTech
  gaugeCamisaoAcoplado?: boolean
  gaugeContingency?: boolean
  contingencyGabaritFT?: YesContingencyNo
  investigationLogs?: InvestigationLog[]
  investigationLogMethods?: Partial<Record<InvestigationLog, 'wireline' | 'electric' | 'ct'>>
  investigationLogContingency?: Partial<Record<InvestigationLog, boolean>>
  tailFishingItems?: FishingItem[]
  vglAction?: VglAction
  vglContingency?: boolean
  vglFishingMethod?: FishingMethod
  vglInstallStv?: boolean
  vglRemoveStv?: boolean
  cleanWithUep?: YesContingencyNo
  cleanWithUepPackages?: string[]
  fs1CsbAlreadyInstalled?: boolean
  fs1CsbPrimary?: Fs1CsbPrimary
  fs1PerfProfunda?: 'yes' | 'no'
  fs1PerfRasa?: 'yes' | 'no'
  fs1CsbSecondary?: Fs1CsbSecondary
  fs1CsbSecondaryMode?: YesContingencyNo
  rcmaCsbPrincipal?: RcmaCsbPrincipal
  rcmaCementPkgs?: RcmaCementPkg[]
  tubingPerfMethod?: TubingPerfMethod
  riserFluid?: RiserFluid
  tcapDisposition?: TcapDisposition
  tcapRemovalMethod?: 'workstring' | 'rov'
  killWellFase1A?: YesContingencyNo
  anularAMinPressure?: AnularAPressure
  anularFillFluid?: AnularFillFluid
  csbPrimary?: CsbPrimary
  ttFtCementMode?: TtFtCementMode
  loggingMode?: LoggingMode
  transponderMode?: TransponderMode
  dhsvBrvType?: DhsvBrvType
  dmmWithEquipment?: boolean
  initialFillFluid?: InitialFillFluid
  anularFluid?: AnularFluid
  amortAnularFluid?: AnularFluid
  jatearCopCoi?: YesContingencyNo
  installTmfPlugEndProd?: YesContingencyNo
  installTmfPlugEndAnul?: YesContingencyNo
  tcapSurfaceFluid?: TcapSurfaceFluid
  bopCorrectionMethod?: 'convencional' | 'pwc'
  bopPwcPreLog?: boolean
  bopPwcValidation?: 'params' | 'perfil'
  ccapRemovalMethod?: 'workstring' | 'cable'
  contingencyCcapWorkstring?: YesContingencyNo
  contingencyTcapHydrate?: YesContingencyNo
  contingencyFejat?: YesContingencyNo
  fs2CopCutContingency?: YesContingencyNo
  bopTestMethod?: 'test_plug' | 'ponteira_orman' | 'coluna_flutuada' | 'feth_on_th'
  supIntermTailFishing?: YesContingencyNo
  supIntermTailMethod?: 'overshot' | 'specific_tool'
  fs2PackerFishing?: YesContingencyNo
  fs2CopCutMethod?: 'electric' | 'ct' | 'slip_shot' | 'string_shot'
  fs2ThPlugRemoval?: YesContingencyNo
  isolationCount?: number
  isolations?: IsolationConfig[]
  testColumnWithStdv?: boolean
  stdvDispositionAfterTest?: 'remove' | 'keep'
  contingencyTtFt?: boolean
  perforationTestContingency?: boolean
  logicAnswers?: Record<string, string>
  startDate: string
  percentile: Percentile
}

export interface ProjectField {
  id: string
  label: string
  value: string
}

export interface ProjectSection {
  id: string
  title: string
  collapsed: boolean
  fields: ProjectField[]
}

export type CwoOption = 'FIBOP/BOPW/TRT' | 'FIBOP/BOPW/TIT' | 'FDR/FIANM' | 'FDR/FIANM/ADWO/TRT' | 'TIT' | 'TRT' | ''
export type CamisaoTipo = 'permanente' | 'drop-off' | ''

export interface BhaPlanFields {
  // Perfuração
  canhao?: string         // diâmetro nominal do canhão (pol)
  prof?: string           // profundidade (m) — perf e corte
  diam?: string           // diâmetro do tubo (pol) — perf e corte
  tfa?: string            // TFA (pol²) — perf e corte
  tfaMin?: string         // TFA mínimo (pol²) — tubing puncher
  // Arame
  modelo?: string         // modelo do aplicador/pescador (instalação/retirada)
  // Flexitubo - gabaritagem com motor/broca
  motorFundo?: string     // diâmetro do motor de fundo
  broca?: string          // diâmetro da broca
  modeloBroca?: string    // modelo da broca
  // Gabaritagem
  diamEstampador?: string   // não-FT e FT sem motor/broca
  diamLocalizador?: string  // não-FT
  tipoLocalizador?: string  // não-FT
  driftRing?: string        // FT
  profFinal?: string        // gabaritagem com arame
  // TAE
  taeProf?: string
  taeDiamNom?: string
  // Jateamento
  jateadorDiam?: string
  jateadorDisposicao?: string
  jateamTopo?: string        // topo do intervalo de jateamento (FT)
  jateamBase?: string        // base do intervalo de jateamento (FT)
  jateamPassadas?: string    // quantidade de passadas (FT)
  // Camisão (por pacote)
  camDiamNom?: string
  camDiamInt?: string
  camTipo?: 'permanente' | 'drop-off' | ''
  // Checagem TOC com polias
  tocEstampador?: string
  // Corte de coluna
  cortadorModelo?: string
  // Stroker (electric)
  strokerAncoragem?: string
  // Avaliação de cimentação
  intervaloInteresseTopo?: string
  intervaloInteresseBase?: string
  // Instalação BPR/BPP com FT
  bpProf?: string
  bpDiam?: string
  // Cimentação interior COP com FT (em duas etapas)
  ogivaDiam?: string
  // Cimentação com CR
  crProf?: string
  // VGL
  vglCamisaoAcoplado?: 'sim' | 'nao' | ''
  vglTipo?: 'cega' | 'operadora' | ''
  // PWC
  pwcCanhoneioTopo?: string
  pwcCanhoneioBase?: string
  pwcIcf?: string
  pwcCanhaoRecuperado?: 'sim' | 'nao' | ''
  // Condicionamento (coluna)
  condicBroca?: string
  condicRaspador?: string
  // BPP (elétrico)
  bppAncoragemKlbf?: string
  // Wireline — diâmetros de ferramenta
  aplicadorCamisao?: string     // ABAN 037: nome+Ø do aplicador/GS (ex: "GS 4\"")
  diamCacamba?: string          // ABAN 046: caçamba (bailer)
  tipoDesviador?: string        // ABAN 056/057: desviador VGL
  diamJdc?: string              // ABAN 034/035/056/057: JDC
  modeloSlidingSleeve?: string  // ABAN 058/059: modelo do Sliding Sleeve
}

export interface CimentPlugFields {
  base?: string
  topo?: string
}

export interface ProjectData {
  sonda: string; mr: string; poco: string; mrp: string; lda: string
  pocoOrigem: string; distanciaEntrePocos: string; velocidadeMedia: string
  cwo: CwoOption
  fluidoPeso: string
  topKillFluid: string; topKillPeso: string
  amortFluid: string; amortPeso: string
  pressaoFratCapea: string; limitePressaoBombeio: string
  mapecab: string; pressaoSuperficie: string; pressaoTrtAnm: string
  pressaoSuperficieTechs: Technology[]
  bhaPlans: Record<string, BhaPlanFields>
  nipple381: string; nipple381Depth: string
  nipple375: string; nipple375Depth: string
  nippleDhsv: string; nippleDhsvDepth: string
  nipple281: string; nipple281Depth: string
  nippleTHanular: string; nippleTHanularDepth: string
  nipple275: string; nipple275Depth: string
  nipplesOutros: string; nipplesOutrosDepth: string
  insertNipple: string; camisaoId: string
  // Cimentação
  cimentTopoAnularA: string
  cimentTopoInteriorColuna: string
  cimentTopoRevcim: string          // TOC verificado no REVCIM (m) — ABAN 247,248
  cimentProfPerfuracao: string      // TT: profundidade da perfuração da coluna
  cimentProfBaseCimentacao: string  // TT: profundidade da base da cimentação
  cimentCrProfundidade: string      // TT com CR: profundidade de assentamento
  cimentPlugs: Record<string, CimentPlugFields>  // key = item.uid
  cimentPwc: string
  testeInfluxo: string
  hpNavFundo: boolean; hpSsub: boolean
  hpCsbPrimario: boolean; hpCsbSecundario: boolean
  holdPoints: string[]
  // Outros
  outrosTrtWeightTcap: string
  outrosTrtWeightAnm: string
  outrosMegConc: string
  outrosCoolingFlow: string
  outrosPcabN2Psi: string
  outrosPcabN2PsiHp?: boolean    // É Hold Point? — Pcab N₂ teste de influxo
  outrosDrainB2Psi: string
  outrosN2FlowScfm: string
  // Pressões operacionais
  pressaoCavFibop: string        // ABAN 011,012,211,212 — cavidade FIBOP/FDR
  pressaoHcr: string             // ABAN 011,211,212 — estanqueidade HCR (AGMAR)
  pressaoBoreTest: string        // ABAN 013,206 — bore 2"/4" e CWO
  pressaoRiserBores: string      // ABAN 012 — teste dos bores 4"/2" (descida contra VGs + estanqueidade contra base de teste)
  pressaoRiserCavConexao: string // ABAN 012 — cavidade de cada conexão do Riser DB durante a descida
  pressaoRiserDpr: string        // ABAN 014,015,016,017 — linhas de superfície e manifold (+ linhas de N2)
  pressaoColunaDpr: string       // ABAN 014 — estanqueidade da coluna de DPR (contra VG5 da FDR/TRT)
  pressaoColunaRiserDb: string   // ABAN 015 — estanqueidade da coluna de riser DB (contra VB5/VB2 da FDR/TRT)
  pressaoN2Trt: string           // ABAN 024,025 — N2 interface TRT×ANM
  pressaoTmfProd: string         // ABAN 026 — TMF bore produção N2
  pressaoTmfAnulAnm: string      // ABAN 027,028,029 — blocos ANM
  pressaoBullheadDhsv: string    // ABAN 030 — teste funcional de DHSV
  pressaoBopArameHigh: string    // ABAN 031A/B,032,033 (wireline), 085,086,087 (electric), 119,120 (CT) — teste alta equipamentos pressão
  pressaoBopPerfuracao: string   // ABAN 228,229,254,241 — teste pressão BOP perfuração descido Fase 2
  pressaoVgx: string             // ABAN 184 — teste anel VGX do BOP contra CSB (auto: MAPECAB)
  pressaoKillChoke: string       // ABAN 184 — linhas kill/choke descida BOP (auto: MAPECAB)
  pressaoEquipSupBop: string     // ABAN 184 — equipamentos de superfície (choke/standpipe manifold, TIWs, IBOPs)
  pressaoProva: string           // fallback genérico — "com XXX psi" (estanqueidade pós-instalação)
  pressaoEstStvR: string         // Estanqueidade pós-instalação — STV nipple R 2,75"
  pressaoEstStvRHp?: boolean     // É Hold Point? — STV nipple R
  pressaoEstPlugR: string        // Estanqueidade pós-instalação — Plug nipple R 2,75"
  pressaoEstPlugRHp?: boolean    // É Hold Point? — Plug nipple R
  pressaoEstPlugF: string        // Estanqueidade pós-instalação — Plug nipple F 2,81"
  pressaoEstPlugFHp?: boolean    // É Hold Point? — Plug nipple F
  pressaoEstPlugTH: string       // Estanqueidade pós-instalação — Plug 3,75" no TH
  pressaoEstPlugTHHp?: boolean   // É Hold Point? — Plug TH
  pressaoEstTae: string          // Estanqueidade pós-instalação — TAE
  pressaoEstTaeHp?: boolean      // É Hold Point? — TAE
  pressaoEstTmfProd: string      // Estanqueidade pós-instalação — Plug TMF (bore de produção)
  pressaoEstTmfAnul: string      // Estanqueidade pós-instalação — Plug TMF (bore de anular)
  revcimHp?: boolean             // É Hold Point REVCIM? — avaliação de cimentação e checagem de topo

  // Fluidos operacionais
  bullheadVolume: string         // ABAN 030,062 — volume diesel/MEG bullheading
  bullheadDepth: string          // ABAN 030 — profundidade relativa à DHSV
  amortFcbaDensidade: string     // ABAN 061-063 — densidade FCBA/MEG amortecimento
  // Cimentação operacional
  cimentAlinhamento: string      // ABAN 078-084 — via xxx > xxx > xxx
  cimentPlugVol: string          // ABAN 078,079 — volume tampão (bbl)
  cimentPlugDens: string         // ABAN 078,079 — densidade tampão (lb/gal)
  cimentFcbaDens: string         // ABAN 078,079 — densidade deslocamento FCBA (lb/gal)
  // Em implementação — campos novos (sem seção semântica final ainda)
  colunaTrabalhoDpDiam: string   // Ø da coluna de trabalho DP (COT DP) — ABAN 182-202 (Fase 2/retirada)
  volBombeioDescidaFt: string    // volume de bombeio na descida com FT (bbl a cada 500 m) — ABAN 124-135
  crDiam: string                 // Ø do CR / Cement Retainer (FT) — ABAN 155,156,158
  packerFtDiam: string           // Ø do Packer FT (inflável/multiset) — ABAN 159,164
  marteleteModelo: string        // modelo da ponteira do martelete FT — ABAN 143
  marteletePonteiraDiam: string  // Ø da ponteira do martelete FT (") — ABAN 143
  bismutoEur: string             // Tampão de bismuto — EUR (extensão útil real, m) — ABAN 238
  bismutoOverpull: string        // Tampão de bismuto — overpull de liberação (lbf) — ABAN 238
  // Em implementação — Fase B (placeholders sem campo dedicado)
  fcbaCorteDens: string          // densidade FCBA corte/substituição/circulação (ppg) — ABAN 186,189,190,235,236
  adaptadorMc: string            // adaptador MC (interface da COT) — ABAN 013
  pressaoCabecaLimite: string    // limite de pressão de cabeça no bullheading (psi) — ABAN 061,062
  gabaritoNippleDiam: string     // Ø do nipple na gabaritagem (") — ABAN 079
  tampaoTipo: string             // tipo de tampão (plug/TAE/bismuto) — ABAN 079
  cimentAnularAcimaTampao: string // topo do cimento em anular acima do tampão (m) — ABAN 082,084
  canhaoModelo: string           // modelo do canhão — ABAN 102
  plugFtDiam: string             // Ø do plug FT no TH (") — ABAN 129
  plugFtAplicador: string        // aplicador do plug FT — ABAN 129
  ferramentaBoDuplaDiam: string  // Ø da ferramenta BO dupla (FT) (") — ABAN 144,145
  overpullKlbf: string           // overpull de retirada COP/COI (klbf) — ABAN 186
  copCoiTubo: string             // Ø/identificação do tubo COP/COI na retirada — ABAN 188,189,190
  revestimentoDiam: string       // Ø do revestimento na manobra (") — ABAN 196
  tampaoAbandonoDens: string     // tampão de abandono — densidade da pasta (ppg) — ABAN 199,200
  tampaoAbandonoTopo: string     // tampão de abandono — topo previsto (m) — ABAN 199,200
  tampaoAbandonoCompr: string    // tampão de abandono — comprimento (m) — ABAN 199,200
  ecsbFluidoDens: string         // fluido eCSB a mar aberto — densidade (ppg) — ABAN 200
  condicIntervaloTopo: string    // condicionamento — topo do intervalo (m) — ABAN 233
  condicIntervaloBase: string    // condicionamento — base do intervalo (m) — ABAN 233
  ferramentaBhaFt: string        // ferramentas do BHA de FT (descrição) — ABAN 147
  taeTuboDiam: string            // Ø nominal do tubo onde o TAE será instalado (") — ABAN 237
  profRegistroPressao: string    // profundidade do registro de pressão (RP) (m) — ABAN 047
  numEstacoesRp: string          // quantidade de estações do registro de pressão — ABAN 047
  corteBrocaDiam: string         // Ø da broca tricônica de corte de cimento (") — ABAN 235
  corteDcSecoes: string          // nº de seções de DC 6¾" no BHA de corte — ABAN 235
  corteHwdpSecoes: string        // nº de seções de HWDP 5" no BHA de corte — ABAN 235
}

export interface FineTuningLine {
  id: string
  text: string
  navTemplate?: string    // texto-template (com tokens {{campo=glifo}}) das linhas de navegação
  dataTemplate?: string   // texto-template (com tokens {{campo=glifo}}) das demais linhas com placeholder
  technology: Technology
  duration?: number
  isContingency?: boolean
  isParallel?: boolean
  procedures?: string
  details?: string
  normas?: string
  observacoes?: string
  csbPrimario?: string
  csbSecundario?: string
  bha?: string
  edsNumber?: number      // índice 0-8 do tipo de EDS (0 = Sem Corte, default) → activity/eds_number
  edsComment?: string     // comentário livre do EDS → activity/eds_comment
  isNavLine?: boolean
  // Source data from packageLines (planilha)
  compensando?: boolean | null   // 3 estados: true (VERDADEIRO) / false (FALSO) / null (NULL)
  bopMarker?: 'CONNECT_BOP' | 'DISCONNECT_BOP'
  owFase?: string
  owAtividade?: string
  owOperacao?: string
  owEtapa?: string
  genOperacao?: string
  genOperacaoDual?: string
  highlight?: 'yellow' | 'green' | 'blue' | 'orange' | 'rose'
}

export interface FineTuningItem {
  uid: string
  packageId: string
  packageName: string
  phase: Phase
  technology: Technology
  duration: number
  isContingency: boolean
  isParallel?: boolean
  isBlank?: boolean
  lines: FineTuningLine[]
  expanded: boolean
  procedures?: string
  details?: string
  normas?: string
  observacoes?: string
}

export interface AppState {
  view: 'home' | 'wizard' | 'schedule' | 'fine_tuning'
  wizardStep: number
  inputs: Partial<WizardInputs>
  schedule: ScheduleItem[]
  fineTuningItems: FineTuningItem[]
  projectSections: ProjectSection[]
  projectData: ProjectData
  wellName: string
  /** id do projeto no servidor (presente quando carregado/salvo via API). */
  projectId?: string
  showHours: boolean
  pendingReview: string[]
  /** Estado pré-aplicação (projectData + linhas) para cancelar a revisão ("Sair"). */
  reviewSnapshot: { projectData: ProjectData; fineTuningItems: FineTuningItem[] } | null
}
