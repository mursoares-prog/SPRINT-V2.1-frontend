// Catálogo dos placeholders {{campo=glifo}} organizado nas mesmas seções do
// assistente de preenchimento (ProjectDataPanel), para o seletor "Inserir
// placeholder" do editor de linha no Admin.
//
// Fonte de verdade APENAS do agrupamento + rótulos legíveis do seletor; a lista
// de tokens válidos continua vindo do backend (GET /api/base/fields). Tokens não
// listados aqui aparecem no grupo "Outros (sem categoria)" do editor, então a
// completude nunca depende deste arquivo estar 100% atualizado.
//
// Os rótulos espelham os `label=` usados no ProjectDataPanel.tsx. Ao adicionar um
// campo novo lá, acrescente o token no grupo correspondente aqui (opcional — sem
// isso ele só cai em "Outros").

export type PlaceholderField = { token: string; label: string }
export type PlaceholderGroup = { id: string; title: string; fields: PlaceholderField[] }

export const PLACEHOLDER_CATALOG: PlaceholderGroup[] = [
  {
    id: 'navegacao',
    title: 'Navegação',
    fields: [
      { token: 'pocoOrigem', label: 'Poço origem' },
      { token: 'poco', label: 'Poço destino' },
      { token: 'distanciaEntrePocos', label: 'Distância entre poços' },
      { token: 'velocidadeMedia', label: 'Velocidade média' },
    ],
  },
  {
    id: 'equipamentos_submarinos',
    title: 'Equipamentos Submarinos',
    fields: [
      { token: 'outrosTrtWeightTcap', label: 'Peso liberado com TRT sobre Tree Cap' },
      { token: 'outrosTrtWeightAnm', label: 'Peso liberado com TRT na ANM' },
      { token: 'pressaoBoreTest', label: 'Teste bore 2"/4" e CWO' },
      { token: 'pressaoTmfAnulAnm', label: 'Blocos ANM (TMF anular)' },
      { token: 'outrosDrainB2Psi', label: 'Pressão drenagem B2" equalização via ANM' },
      { token: 'pressaoN2Trt', label: 'N₂ interface TRT × ANM' },
      { token: 'pressaoBullheadDhsv', label: 'Pressão LC DHSV' },
    ],
  },
  {
    id: 'equipamentos_superficie',
    title: 'Equipamentos de Superfície',
    fields: [
      { token: 'pressaoRiserDpr', label: 'Teste de linhas de superfície e manifold auxiliar' },
      { token: 'pressaoBopArameHigh', label: 'Teste alta equipamentos de pressão (SL, WL e FT)' },
    ],
  },
  {
    id: 'nipples',
    title: 'Nipples',
    fields: [
      { token: 'nipple381', label: 'TMF (prod.) — tipo' },
      { token: 'nipple381Depth', label: 'TMF (prod.) — profundidade' },
      { token: 'nipple375', label: 'TMF (anular) — tipo' },
      { token: 'nipple375Depth', label: 'TMF (anular) — profundidade' },
      { token: 'nipple281', label: 'TH (prod.) — tipo' },
      { token: 'nipple281Depth', label: 'TH (prod.) — profundidade' },
      { token: 'nippleTHanular', label: 'TH (anular) — tipo' },
      { token: 'nippleTHanularDepth', label: 'TH (anular) — profundidade' },
      { token: 'nippleDhsv', label: 'DHSV — tipo' },
      { token: 'nippleDhsvDepth', label: 'DHSV — profundidade' },
      { token: 'nipple275', label: 'TSR — tipo' },
      { token: 'nipple275Depth', label: 'TSR — profundidade' },
      { token: 'nipplesOutros', label: 'Cauda prod. — tipo' },
      { token: 'nipplesOutrosDepth', label: 'Cauda prod. — profundidade' },
    ],
  },
  {
    id: 'testes_escp',
    title: 'Testes ESCP',
    fields: [
      { token: 'mapecab', label: 'MAPECAB' },
      { token: 'pressaoKillChoke', label: 'Equipamentos de superfície e linhas de kill e choke' },
      { token: 'pressaoEquipSupBop', label: 'Equipamentos de superfície do BOP' },
      { token: 'pressaoVgx', label: 'Teste anel VGX do BOP × CSB' },
      { token: 'pressaoBopPerfuracao', label: 'Teste do BOP (perfuração)' },
    ],
  },
  {
    id: 'retirada_coluna',
    title: 'Retirada de Coluna',
    fields: [
      { token: 'copCoiTubo', label: 'Ø/ident. tubo COP/COI (retirada)' },
    ],
  },
  {
    id: 'fluidos',
    title: 'Fluidos',
    fields: [
      { token: 'limitePressaoBombeio', label: 'Limite P. bombeio' },
      { token: 'amortFcbaDensidade', label: 'Densidade FCBA/MEG amortecimento' },
      { token: 'pressaoCabecaLimite', label: 'Limite pressão de cabeça (bullheading)' },
      { token: 'bullheadVolume', label: 'Volume diesel/MEG bullheading' },
      { token: 'fcbaCorteDens', label: 'Densidade FCBA (corte/substituição)' },
    ],
  },
  {
    id: 'bha_plano',
    title: 'BHA — Plano (por operação)',
    fields: [
      { token: 'prof', label: 'Profundidade' },
      { token: 'profFinal', label: 'Profundidade final' },
      { token: 'modelo', label: 'Aplicador/Pescador — nome e Ø' },
      { token: 'canhao', label: 'Diâmetro nominal do canhão' },
      { token: 'tfaMin', label: 'TFA mínimo' },
      { token: 'diam', label: 'Diâmetro do tubo' },
      { token: 'tfa', label: 'TFA' },
      { token: 'broca', label: 'Diâmetro da broca' },
      { token: 'modeloBroca', label: 'Modelo da broca' },
      { token: 'motorFundo', label: 'Diâmetro do motor de fundo' },
      { token: 'driftRing', label: 'Drift Ring' },
      { token: 'diamLocalizador', label: 'Ø localizador (collet/nipple)' },
      { token: 'diamEstampador', label: 'Ø estampador' },
      { token: 'diamCacamba', label: 'Ø caçamba' },
      { token: 'diamJdc', label: 'Ø JDC' },
      { token: 'tipoDesviador', label: 'Desviador — Tipo/Modelo' },
      { token: 'modeloSlidingSleeve', label: 'Sliding Sleeve — Modelo' },
      { token: 'bppAncoragemKlbf', label: 'Força de ancoragem BPP' },
      { token: 'bpProf', label: 'BP — Profundidade' },
      { token: 'bpDiam', label: 'BP — Diâmetro do tubo' },
      { token: 'taeProf', label: 'TAE — Profundidade' },
      { token: 'taeDiamNom', label: 'TAE — Diâmetro nominal' },
      { token: 'aplicadorCamisao', label: 'Camisão — Aplicador/Pescaria' },
      { token: 'camDiamNom', label: 'Camisão — Ø nominal' },
      { token: 'camDiamInt', label: 'Camisão — Ø interno' },
      { token: 'camTipo', label: 'Camisão — Tipo (permanente/drop-off)' },
      { token: 'jateamTopo', label: 'Intervalo de jateamento — Topo' },
      { token: 'jateamBase', label: 'Intervalo de jateamento — Base' },
      { token: 'jateamPassadas', label: 'Quantidade de passadas (jateamento)' },
      { token: 'intervaloInteresseTopo', label: 'Intervalo de interesse — Topo' },
      { token: 'intervaloInteresseBase', label: 'Intervalo de interesse — Base' },
      { token: 'pwcCanhoneioTopo', label: 'PWC — Canhoneio — Topo' },
      { token: 'pwcCanhoneioBase', label: 'PWC — Canhoneio — Base' },
    ],
  },
  {
    id: 'bha_wireline',
    title: 'BHA — Wireline (arame)',
    fields: [
      { token: 'pressaoEstStvR', label: 'Estanqueidade — STV nipple R 2,75"' },
      { token: 'pressaoEstPlugR', label: 'Estanqueidade — Plug nipple R 2,75"' },
      { token: 'pressaoEstPlugF', label: 'Estanqueidade — Plug nipple F 2,81"' },
      { token: 'pressaoEstPlugTH', label: 'Estanqueidade — Plug 3,75" no TH' },
      { token: 'outrosPcabN2Psi', label: 'Pcab N₂ — teste de influxo (underbalance)' },
      { token: 'gabaritoNippleDiam', label: 'Ø nipple (gabaritagem)' },
      { token: 'tampaoTipo', label: 'Tipo de tampão (plug/TAE/bismuto)' },
      { token: 'profRegistroPressao', label: 'Profundidade do registro de pressão' },
      { token: 'numEstacoesRp', label: 'Quantidade de estações (RP)' },
      { token: 'bismutoEur', label: 'Tampão bismuto — EUR' },
      { token: 'bismutoOverpull', label: 'Tampão bismuto — overpull de liberação' },
    ],
  },
  {
    id: 'bha_electric',
    title: 'BHA — Elétrico',
    fields: [
      { token: 'pressaoEstTae', label: 'Estanqueidade — TAE' },
      { token: 'taeTuboDiam', label: 'Ø nominal do tubo (instalação TAE)' },
      { token: 'canhaoModelo', label: 'Modelo do canhão' },
    ],
  },
  {
    id: 'bha_ct',
    title: 'BHA — Flexitubo (CT)',
    fields: [
      { token: 'volBombeioDescidaFt', label: 'Volume bombeio na descida com FT' },
      { token: 'packerFtDiam', label: 'Ø Packer FT (inflável/multiset)' },
      { token: 'plugFtDiam', label: 'Ø plug FT (TH)' },
      { token: 'plugFtAplicador', label: 'Aplicador do plug FT' },
      { token: 'ferramentaBoDuplaDiam', label: 'Ø ferramenta BO dupla (FT)' },
      { token: 'ferramentaBhaFt', label: 'Ferramentas do BHA (FT)' },
    ],
  },
  {
    id: 'bha_workstring',
    title: 'BHA — Coluna (workstring)',
    fields: [
      { token: 'colunaTrabalhoDpDiam', label: 'Ø coluna de trabalho DP (COT DP)' },
      { token: 'adaptadorMc', label: 'Adaptador MC (interface COT)' },
      { token: 'overpullKlbf', label: 'Overpull (retirada COP/COI)' },
      { token: 'revestimentoDiam', label: 'Ø revestimento (manobra)' },
      { token: 'condicIntervaloTopo', label: 'Condicionamento — Topo do intervalo' },
      { token: 'condicIntervaloBase', label: 'Condicionamento — Base do intervalo' },
      { token: 'corteBrocaDiam', label: 'Ø broca (corte de cimento)' },
      { token: 'corteDcSecoes', label: 'Nº seções DC 6¾" (corte)' },
      { token: 'corteHwdpSecoes', label: 'Nº seções HWDP 5" (corte)' },
    ],
  },
  {
    id: 'cimentacao',
    title: 'Cimentação',
    fields: [
      { token: 'cimentTopoAnularA', label: 'Topo no anular A' },
      { token: 'cimentTopoInteriorColuna', label: 'Topo no interior da coluna' },
      { token: 'cimentProfPerfuracao', label: 'Profundidade da perfuração da coluna' },
      { token: 'cimentProfBaseCimentacao', label: 'Profundidade da base da cimentação' },
      { token: 'cimentCrProfundidade', label: 'Profundidade de assentamento do CR' },
      { token: 'cimentAlinhamento', label: 'Alinhamento bombeio ("via xxx > xxx")' },
      { token: 'cimentPlugVol', label: 'Volume tampão de cimento' },
      { token: 'cimentPlugDens', label: 'Densidade tampão de cimento' },
      { token: 'cimentFcbaDens', label: 'Densidade deslocamento FCBA' },
      { token: 'crDiam', label: 'Ø CR (Cement Retainer)' },
      { token: 'cimentAnularAcimaTampao', label: 'Topo cimento anular acima do tampão' },
      { token: 'tampaoAbandonoDens', label: 'Tampão abandono — densidade pasta' },
      { token: 'tampaoAbandonoTopo', label: 'Tampão abandono — topo previsto' },
      { token: 'tampaoAbandonoCompr', label: 'Tampão abandono — comprimento' },
      { token: 'ecsbFluidoDens', label: 'Fluido eCSB (mar aberto) — densidade' },
    ],
  },
  {
    id: 'outros',
    title: 'Outros',
    fields: [
      { token: 'outrosMegConc', label: 'Concentração MEG fluido inibido' },
      { token: 'outrosCoolingFlow', label: 'Vazão circ. resfriamento p/ cimentação' },
      { token: 'pressaoTmfProd', label: 'Plug TMF bore produção N₂' },
      { token: 'pressaoProva', label: 'Estanqueidade (genérico / fallback)' },
    ],
  },
  {
    id: 'hp_especiais',
    title: 'Prefixos / Hold Points (especiais)',
    fields: [
      { token: '_bopBaixa', label: 'Pressão BOP baixa (300 quando há teste de alta)' },
      { token: '_hpEcsBop', label: 'Prefixo "[HOLD POINT - ECS/BOP]" (sempre ativo)' },
      { token: '_hpEstStvR', label: 'Prefixo "[HOLD POINT - SMAB]" — STV nipple R' },
      { token: '_hpEstPlugR', label: 'Prefixo "[HOLD POINT - SMAB]" — Plug nipple R' },
      { token: '_hpEstPlugF', label: 'Prefixo "[HOLD POINT - SMAB]" — Plug nipple F' },
      { token: '_hpEstPlugTH', label: 'Prefixo "[HOLD POINT - SMAB]" — Plug TH' },
      { token: '_hpEstTae', label: 'Prefixo "[HOLD POINT - SMAB]" — TAE' },
      { token: '_hpPcabN2', label: 'Prefixo "[HOLD POINT - SMAB]" — Pcab N₂' },
      { token: '_hpRevcim', label: 'Prefixo "[HOLD POINT - REVCIM]" — avaliação cimentação' },
    ],
  },
]

// token -> rótulo (lookup rápido).
export const PLACEHOLDER_LABELS: Record<string, string> = Object.fromEntries(
  PLACEHOLDER_CATALOG.flatMap(g => g.fields.map(f => [f.token, f.label])),
)
