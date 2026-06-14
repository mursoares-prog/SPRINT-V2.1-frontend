export type LPkg = { id: string; name: string }
export interface LAns {
  label: string; active?: boolean; note?: string
  packages?: LPkg[]; sub?: LDec[]
}
export interface LDec { question: string; answers: LAns[] }
export interface LSec {
  id: string; label: string; phase: string; color: 'gray'|'blue'|'amber'
  always?: LPkg[]; decisions: LDec[]
}

// ── SEÇÕES COMPARTILHADAS (Fase 0 / 1A) ────────────────────────────────────

// CCAP + TCap por ROV (POST_MOB na engine): comuns às duas sondas.
const _MOB_POST: LDec[] = [
  {
    question: 'Cap de corrosão (CCAP)?',
    answers: [
      { label: 'Não', active: true },
      { label: 'Sim', packages: [
        { id: 'ABAN 008', name: 'Retirada de CCAP com coluna de trabalho (garatéia)' },
      ]},
    ],
  },
  {
    question: 'Retirar TCap por ROV?',
    answers: [
      { label: 'Não', active: true },
      { label: 'Sim', packages: [
        { id: 'ABAN 010', name: 'Retirar de TCap com ROV' },
      ]},
    ],
  },
]

// Sonda DP (posicionamento dinâmico): transponder + DMM + calibração DP.
// Espelha MOB_DP da engine (sequences.ts): recolhimento → DMM → lançamento → POST_MOB.
const SEC_MOB_DP: LSec = {
  id: 'mob', label: 'MOBILIZAÇÃO (DP)', phase: 'Fase 0', color: 'gray',
  decisions: [
    {
      question: 'Modo do transponder?',
      answers: [
        { label: 'ROV', active: true, packages: [
          { id: 'ABAN 002', name: 'Recolhimento de transponder com ROV' },
          { id: 'ABAN 007', name: 'Lançamento de transponder com ROV e calibração DP' },
        ]},
        { label: 'COT', packages: [
          { id: 'ABAN 001', name: 'Recolhimento de transponder com COT' },
          { id: 'ABAN 006', name: 'Lançamento de transponder com COT e calibração DP' },
        ]},
      ],
    },
    {
      question: 'DMM — equipamento subsea no fundo?',
      answers: [
        { label: 'Não', active: true, packages: [
          { id: 'ABAN 003', name: 'DMM' },
        ]},
        { label: 'Sim — Fase 1', packages: [
          { id: 'ABAN 004', name: 'DMM - Fase 1 / Stack-up SSUB no fundo' },
        ]},
        { label: 'Sim — Fase 2', packages: [
          { id: 'ABAN 005', name: 'DMM - Fase 2 / BOP no fundo' },
        ]},
      ],
    },
    ..._MOB_POST,
  ],
}

// Sonda ancorada (ANC): DMA, sem transponder/calibração DP.
// Espelha MOB_ANC da engine (sequences.ts): ABAN 208 + POST_MOB.
const SEC_MOB_ANC: LSec = {
  id: 'mob', label: 'MOBILIZAÇÃO (ANC)', phase: 'Fase 0', color: 'gray',
  always: [
    { id: 'ABAN 208', name: 'DMA' },
  ],
  decisions: [..._MOB_POST],
}

const SEC_DESCIDA: LSec = {
  id: 'desc', label: 'DESCIDA DO WO', phase: 'Fase 1A', color: 'blue',
  always: [
    { id: 'ABAN 011', name: 'Descida do conjunto de WO (DPR/HCR)' },
    { id: 'NOVO 015', name: 'Montagem do SFT (DP Generalista)' },
    { id: 'ABAN 014', name: 'Flush do DPR/HCR' },
  ],
  decisions: [
    {
      question: 'Fluido de riser inibido?',
      answers: [
        { label: 'Sim', active: true, packages: [
          { id: 'ABAN 215', name: 'Posicionamento de fluido inibido no DPR/HCR' },
        ]},
        { label: 'N₂ / sem fluido', packages: [
          { id: 'ABAN 016', name: 'Desalagamento DPR/HCR com Nitrogênio' },
        ]},
      ],
    },
  ],
}

const SEC_CONEXAO: LSec = {
  id: 'conexao', label: 'CONEXÃO NA ANM', phase: 'Fase 1A', color: 'blue',
  always: [
    { id: 'ABAN 023', name: 'Reentrada e conexão na ANM' },
    { id: 'ABAN 024', name: 'Teste funcional — bloco produção' },
    { id: 'ABAN 025', name: 'Teste funcional — bloco anular' },
    { id: 'ABAN 218', name: 'Teste funcional — válvula anular' },
  ],
  decisions: [
    {
      question: 'Hidrato na ANM?',
      answers: [
        { label: 'Sim', active: true,
          packages: [
            { id: 'ABAN 165', name: 'Dissociação hidrato — prod. (DP)' },
            { id: 'ABAN 166', name: 'Dissociação hidrato — anular (DP)' },
          ],
          sub: [{
            question: 'Contingência de válvula ANM?',
            answers: [
              { label: 'Nenhuma', active: true },
              { label: 'Jateamento', packages: [
                { id: 'ABAN 125', name: 'Flexitubo - Jateamento (SpinCat) + Gabaritagem' },
              ]},
              { label: 'Gabarit. FT', packages: [
                { id: 'ABAN 124', name: 'Flexitubo - Gabaritagem' },
              ]},
            ],
          }],
        },
        { label: 'Não' },
      ],
    },
    {
      question: 'Instalação de camisão na DHSV?',
      answers: [
        { label: 'Não', active: true, packages: [
          { id: 'ABAN 028', name: 'Teste bloco produção da ANM' },
          { id: 'ABAN 029', name: 'Teste bloco anular da ANM' },
          { id: 'ABAN 030', name: 'Teste funcional de DHSV (bullheading)' },
        ]},
        { label: 'Sim', packages: [
          { id: 'ABAN 028', name: 'Teste bloco produção da ANM' },
          { id: 'ABAN 029', name: 'Teste bloco anular da ANM' },
        ]},
        { label: 'Contingência', packages: [
          { id: 'ABAN 028', name: 'Teste bloco produção da ANM' },
          { id: 'ABAN 029', name: 'Teste bloco anular da ANM' },
          { id: 'ABAN 030', name: 'Teste funcional de DHSV (bullheading)' },
        ]},
      ],
    },
  ],
}

const SEC_GAB: LSec = {
  id: 'gab', label: 'GABARITAGEM / ANULAR', phase: 'Fase 1A', color: 'blue',
  always: [
    { id: 'ABAN 031A', name: 'Montagem de unidade de arame (DP Generalista)' },
    { id: 'ABAN 036', name: 'Gabaritagem da coluna (arame)' },
  ],
  decisions: [
    {
      question: 'Plug no TH?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', packages: [
          { id: 'ABAN 052', name: 'Retirada de plug 3,75" no TH' },
        ]},
      ],
    },
    {
      question: 'Amortecimento COP — fluido?',
      answers: [
        { label: 'Diesel + FCBA', active: true, packages: [
          { id: 'ABAN 061', name: 'Limpeza e Amort. COP (bullheading diesel + FCBA)' },
        ]},
        { label: 'MEG + FCBA', packages: [
          { id: 'ABAN 062', name: 'Limpeza e Amort. COP (bullheading MEG + FCBA)' },
        ]},
        { label: 'Diesel puro', packages: [
          { id: 'ABAN 219', name: 'Preenchimento de anular A e coluna com diesel' },
        ]},
      ],
    },
    {
      question: 'Pressão no anular A?',
      answers: [
        { label: 'Zero', active: true, packages: [
          { id: 'ABAN 063', name: 'Amort. anular A (despressurização total + bullheading FCBA)' },
        ]},
        { label: 'Top kill — diesel', packages: [
          { id: 'ABAN 064', name: 'Amort. anular A (steps depress. + top kill diesel)' },
        ]},
        { label: 'Top kill — MEG', packages: [
          { id: 'ABAN 065', name: 'Amort. anular A (steps depress. + top kill MEG/FCBA)' },
        ]},
      ],
    },
    {
      question: 'Log de pressão anular?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim', packages: [
          { id: 'ABAN 047', name: 'Registro de pressão e temperatura' },
        ]},
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
        { label: 'Não', active: true, note: '(bloco omitido)' },
        { label: 'Sim', sub: [
          {
            question: 'Hidrato nas flowlines?',
            answers: [
              { label: 'Não', active: true },
              { label: 'Sim / Conting.', packages: [
                { id: 'ABAN 167', name: 'Dissociação hidrato — flowline prod. (DP)' },
                { id: 'ABAN 168', name: 'Dissociação hidrato — flowline anular (DP)' },
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
                { id: 'ABAN 239', name: 'Limpeza de Flowline(s) — N₂ Lift' },
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
        { label: 'Não', active: true, note: '(bloco omitido)' },
        { label: 'Sim',
          packages: [
            { id: 'ABAN 213', name: 'Desassentamento parcial WO (plug anular TMF)' },
            { id: 'NOVO 002', name: 'Instalação plug no TMF (bore anular)' },
            { id: 'ABAN 024', name: 'Teste interface — bore produção' },
            { id: 'ABAN 027', name: 'Teste interface — bore anular' },
          ],
          sub: [{
            question: 'Instalar plug no TMF — produção?',
            answers: [
              { label: 'Não', active: true },
              { label: 'Sim / Conting.', packages: [
                { id: 'NOVO 001', name: 'Instalação plug no TMF (bore produção)' },
              ]},
            ],
          }],
        },
        { label: 'Contingência',
          packages: [
            { id: 'ABAN 213', name: 'Desassentamento parcial WO (plug anular TMF)' },
            { id: 'NOVO 002', name: 'Instalação plug no TMF (bore anular)' },
            { id: 'ABAN 024', name: 'Teste interface — bore produção' },
            { id: 'ABAN 027', name: 'Teste interface — bore anular' },
          ],
        },
      ],
    },
  ],
}

// ── FSU_TT_FT — seções específicas ─────────────────────────────────────────

const SEC_CSB1_TT: LSec = {
  id: 'csb1', label: 'CSB PRIMÁRIO', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'CSB Primário já instalado?',
      answers: [
        { label: 'Sim', active: true, note: '(etapa omitida)' },
        { label: 'Não', sub: [{
          question: 'Tipo de CSB Primário?',
          answers: [
            { label: 'TAE', packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 237', name: 'Instalação de TAE (CSB primário)' },
            ]},
            { label: 'Plug wireline', packages: [
              { id: 'ABAN 040', name: 'Plug em nipple R 2,75"' },
              { id: 'ABAN 221', name: 'Teste influxo c/ N2 (plug) — DPR' },
            ]},
            { label: 'STV wireline', packages: [
              { id: 'ABAN 038', name: 'STV em nipple R 2,75"' },
            ]},
            { label: 'Cimento FT', packages: [
              { id: 'ABAN 156', name: 'Cimentação anular A c/ CR + int. COP (FT)' },
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias' },
            ]},
            { label: 'eCSB bombeio', packages: [
              { id: 'ABAN 079', name: 'Bombeio direto — obturação c/ fluido eCSB' },
            ]},
          ],
        }]},
      ],
    },
  ],
}

const SEC_CORTE_TT: LSec = {
  id: 'corte', label: 'CORTE DE COLUNA', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      // Espelha o campo da etapa 2 "Cortar coluna abaixo do TH?" (hasPDI):
      // Não = há PDI (coluna sacável, corte omitido); Sim = sem PDI → corta (ABAN 113).
      question: 'Cortar coluna abaixo do TH?',
      answers: [
        { label: 'Não — há PDI', active: true, note: '(coluna sacável; corte omitido)' },
        { label: 'Sim — sem PDI', sub: [{
          question: 'Método de corte?',
          answers: [
            { label: 'Mecânico', active: true, packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
            ]},
            { label: 'Químico', packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 117', name: 'Corte de coluna (cortador químico)' },
            ]},
            { label: 'Plasma', packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 118', name: 'Corte de coluna (cortador a plasma)' },
            ]},
            { label: 'Explosivo', packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 225', name: 'Corte de coluna (explosivo)' },
            ]},
          ],
        }]},
      ],
    },
  ],
}

const SEC_CSB2_TT: LSec = {
  id: 'csb2', label: 'CSB SECUNDÁRIO', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Canhoneio raso (tubingPerf)?',
      answers: [
        { label: 'Não', active: true, sub: [{
          question: 'Tipo de CSB Secundário?',
          answers: [
            { label: 'TAE', active: true, packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 237', name: 'TAE — CSB secundário' },
            ]},
            { label: 'Plug TH', packages: [
              { id: 'ABAN 031A', name: 'Montagem unidade arame (DP)' },
              { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
            ]},
          ],
        }]},
        { label: 'Sim — cabo elétrico',
          packages: [
            { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
            { id: 'ABAN 101', name: 'Perfuração da coluna (tubing puncher elétrico)' },
          ],
          sub: [{
            question: 'Tipo de CSB Secundário?',
            answers: [
              { label: 'TAE', active: true, packages: [
                { id: 'ABAN 237', name: 'TAE — CSB secundário' },
              ]},
              { label: 'Plug TH', packages: [
                { id: 'ABAN 031A', name: 'Montagem unidade arame (DP)' },
                { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
              ]},
            ],
          }],
        },
        { label: 'Sim — arame',
          packages: [
            { id: 'ABAN 045', name: 'Perfuração da coluna (eFire — arame)' },
          ],
          sub: [{
            question: 'Tipo de CSB Secundário?',
            answers: [
              { label: 'TAE', active: true, packages: [
                { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
                { id: 'ABAN 237', name: 'TAE — CSB secundário' },
              ]},
              { label: 'Plug TH', packages: [
                { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
              ]},
            ],
          }],
        },
        { label: 'Sim — FT',
          packages: [
            { id: 'ABAN 154', name: 'Perfuração da coluna (tubing puncher FT)' },
          ],
          sub: [{
            question: 'Tipo de CSB Secundário?',
            answers: [
              { label: 'TAE', active: true, packages: [
                { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
                { id: 'ABAN 237', name: 'TAE — CSB secundário' },
              ]},
              { label: 'Plug TH', packages: [
                { id: 'ABAN 031A', name: 'Montagem unidade arame (DP)' },
                { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
              ]},
            ],
          }],
        },
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
          { id: 'ABAN 213', name: 'Retirada do conjunto de WO (DPR/HCR)' },
        ]},
        { label: 'Sim', packages: [
          { id: 'ABAN 178', name: 'Desassentamento de ANM e retirada (DPR/HCR)' },
          { id: 'ABAN 180', name: 'Desmobilização de FIBOP/BOPW/TRT/ANM' },
        ]},
      ],
    },
  ],
}

// ── FSU_TT_BDC — seções específicas ────────────────────────────────────────

const SEC_BDC: LSec = {
  id: 'bdc', label: 'BARREIRA BDC', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Avaliação de cimentação BDC?',
      answers: [
        { label: 'Parâmetros', active: true, packages: [
          { id: 'ABAN 223', name: 'Bombeio direto — cimentação (ANC)' },
          { id: 'ABAN 083', name: 'Cimentação BDC — validação por parâmetros' },
          { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias' },
        ]},
        { label: 'Perfilagem', packages: [
          { id: 'ABAN 223', name: 'Bombeio direto — cimentação (ANC)' },
          { id: 'ABAN 084', name: 'Cimentação BDC — perfilagem a cabo' },
          { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias' },
        ]},
      ],
    },
    {
      question: 'Contingência TT-FT (coluna não estanque)?',
      answers: [
        { label: 'Não prevista', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 125', name: 'Jateamento COP/COI com FT (conting.)' },
          { id: 'ABAN 156', name: 'Cimentação c/ FT — tampão único (conting.)' },
          { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias (conting.)' },
        ]},
      ],
    },
  ],
}

// ── FS1_Mec / FSU_Conv / FSU_Sup — barreiras Fase 1 ───────────────────────

const SEC_CSB1_FS1: LSec = {
  id: 'csb1_fs1', label: 'CSB PRIMÁRIO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'CSB Primário já instalado?',
      answers: [
        { label: 'Sim', active: true, note: '(etapa omitida)' },
        { label: 'Não', sub: [{
          question: 'Tipo de CSB Primário?',
          answers: [
            { label: 'TAE', active: true, packages: [
              { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
              { id: 'ABAN 237', name: 'TAE — CSB primário' },
            ]},
            { label: 'Plug mec.', packages: [
              { id: 'ABAN 040', name: 'Plug em nipple R 2,75"' },
              { id: 'ABAN 221', name: 'Teste influxo c/ N₂ (plug) — DPR' },
            ]},
            { label: 'Cimento FT', packages: [
              { id: 'ABAN 156', name: 'Cimentação c/ FT + CR' },
              { id: 'ABAN 234', name: 'Checagem de TOC — jogo de polias' },
            ]},
            { label: 'eCSB', packages: [
              { id: 'ABAN 079', name: 'Bombeio direto — obturação c/ fluido eCSB' },
            ]},
          ],
        }]},
      ],
    },
  ],
}

const SEC_CORTE_FS1: LSec = {
  id: 'corte_fs1', label: 'CORTE DE COLUNA', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Risco de aprisionamento de coluna?',
      answers: [
        { label: 'Não / N.A.', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
        ], note: 'Pacotes contingenciais de pescaria adicionados ao bloco' },
      ],
    },
  ],
}

const SEC_CSB2_FS1: LSec = {
  id: 'csb2_fs1', label: 'CSB SECUNDÁRIO (FS1)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Perfuração profunda da coluna?',
      answers: [
        { label: 'Cabo elétrico', active: true, packages: [
          { id: 'ABAN 085', name: 'Montagem unidade cabo elétrico (DP)' },
          { id: 'ABAN 101', name: 'Perfuração deep — tubing puncher (cabo elétrico)' },
        ]},
        { label: 'Arame (eFire)', packages: [
          { id: 'ABAN 045', name: 'Perfuração deep — eFire (arame)' },
        ]},
        { label: 'Flexitubo', packages: [
          { id: 'ABAN 154', name: 'Perfuração deep — tubing puncher (FT)' },
        ]},
        { label: 'Não perfurar' },
      ],
    },
    {
      question: 'Canhoneio raso + CSB Secundário?',
      answers: [
        { label: 'Perf. + TAE', active: true, packages: [
          { id: 'ABAN 101', name: 'Perfuração rasa — tubing puncher' },
          { id: 'ABAN 237', name: 'TAE — CSB secundário' },
        ]},
        { label: 'Perf. + Plug TH', packages: [
          { id: 'ABAN 101', name: 'Perfuração rasa — tubing puncher' },
          { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
        ]},
        { label: 'S/ perf. + TAE', packages: [
          { id: 'ABAN 237', name: 'TAE — CSB secundário' },
        ]},
        { label: 'S/ perf. + Plug TH', packages: [
          { id: 'ABAN 042', name: 'Plug 3,75" no TH' },
        ]},
      ],
    },
  ],
}

const SEC_RET_CONV: LSec = {
  id: 'ret_conv', label: 'RETIRADA DO WO + ANM', phase: 'Fase 1B', color: 'blue',
  always: [
    { id: 'ABAN 178', name: 'Desassentamento de ANM e retirada (DPR/HCR)' },
    { id: 'ABAN 180', name: 'Desmobilização de FIBOP/BOPW/TRT/ANM' },
  ],
  decisions: [],
}

// ── FSU_Conv_RCMA — CSB principal antes das barreiras FS1 ──────────────────

const SEC_RCMA_PRINCIPAL: LSec = {
  id: 'rcma_principal', label: 'CSB PRINCIPAL (RCMA)', phase: 'Fase 1A', color: 'blue',
  decisions: [
    {
      question: 'Tipo de CSB Principal RCMA?',
      answers: [
        { label: 'Não Surgência', active: true, note: '(sem pacotes adicionais)' },
        { label: 'Fluido + CSB',
          packages: [
            { id: 'ABAN 079', name: 'Obturação c/ fluido eCSB (CSB principal)' },
          ],
          note: 'CSB secundário não previsto neste caso',
        },
        { label: 'Tampão de cimento',
          note: 'Pacote(s) de cimentação selecionado(s) conforme projeto',
          sub: [{
            question: 'Tampão(ões) de cimentação RCMA?',
            answers: [
              { label: 'Comb. à perda',   active: true, packages: [{ id: 'ABAN 078', name: 'Obturação com tampões de combate a perda' }] },
              { label: 'Cim. COP',        packages: [{ id: 'ABAN 080', name: 'Cimentação de COP' }] },
              { label: 'Form/COP/AnA (param.)', packages: [{ id: 'ABAN 081', name: 'Cimentação Formação/tela + COP + Anular A (parâmetros)' }] },
              { label: 'Form/COP/AnA (perfil.)', packages: [{ id: 'ABAN 082', name: 'Cimentação Formação/tela + COP + Anular A (perfilagem)' }] },
              { label: 'COP/AnA (param.)', packages: [{ id: 'ABAN 083', name: 'Cimentação COP + Anular A (parâmetros)' }] },
              { label: 'COP/AnA (perfil.)', packages: [{ id: 'ABAN 084', name: 'Cimentação COP + Anular A (perfilagem)' }] },
              { label: 'FT — int. COP',    packages: [{ id: 'ABAN 159', name: 'FT - Cimentação Interior da COP' }] },
              { label: 'FT — revest. aberto', packages: [{ id: 'ABAN 160', name: 'FT - Cimentação Interior de revestimento a mar aberto' }] },
            ],
          }],
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
          { id: 'NOVO 011', name: 'Teste de BOP — ponteira ORMAN (FS2)' },
        ]},
        { label: 'Coluna flutuada', packages: [
          { id: 'ABAN 229', name: 'Teste de BOP — coluna flutuada (FS2)' },
        ]},
        { label: 'FETH no TH', packages: [
          { id: 'NOVO 012', name: 'Teste de BOP c/ FETH apoiada no TH (FS2)' },
        ], note: 'Emitido após a descida da FETH'},
      ],
    },
  ],
}

const SEC_FETH_COP: LSec = {
  id: 'feth_cop', label: 'FETH + COLUNA + COP', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 185', name: 'Descida da FETH (modo BOP)' },
    { id: 'ABAN 189', name: 'Retirada de TH + COP/COI com FETH (modo BOP)' },
  ],
  decisions: [
    {
      question: 'Coluna presa — corte? (conting.)',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 186', name: 'Descida de THRT (modo BOP)' },
          { id: 'NOVO 009', name: 'Free point (investigação de prisão)' },
          { id: 'ABAN 113', name: 'Corte de coluna (cortador mecânico)' },
          { id: 'ABAN 190', name: 'Retirada de TH + COP/COI com THRT (modo BOP)' },
        ]},
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
      question: 'Coluna presa — corte? (conting.)',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'NOVO 010', name: 'Corte de coluna a mar aberto' },
        ]},
      ],
    },
    {
      question: 'Avaliação de cimento antes do tampão?',
      answers: [
        { label: 'Sim (padrão)', active: true, packages: [
          { id: 'ABAN 107', name: 'Avaliação de cimentação — cabo aberto (RCMA)' },
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
      question: 'Pescaria de packer?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Sim / Conting.', packages: [
          { id: 'ABAN 192', name: 'Pescaria de packer — overshot específico' },
          { id: 'ABAN 193', name: 'Conting.: corte de packer c/ sapata de lavagem' },
          { id: 'ABAN 194', name: 'Conting.: estampagem de packer' },
        ]},
      ],
    },
  ],
}

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
      question: 'Tipo de tampão de isolamento?',
      answers: [
        { label: 'BPP', active: true, packages: [
          { id: 'ABAN 199', name: 'Tampão de isolamento BPP inflável' },
        ]},
        { label: 'Pata de Mula', packages: [
          { id: 'ABAN 200', name: 'Tampão de isolamento pata de mula' },
        ]},
      ],
    },
    {
      question: 'Precisa correção de cimentação?',
      answers: [
        { label: 'Não', active: true },
        { label: 'Convencional', packages: [
          { id: 'ABAN 202', name: 'Recimentação/correção de cimento com CR' },
          { id: 'ABAN 200', name: 'Tampão de cimento com pata de mula' },
        ]},
        { label: 'PWC', packages: [
          { id: 'ABAN 231', name: 'Complemento/Correção de cimentação com PWC' },
          { id: 'ABAN 200', name: 'Tampão de cimento com pata de mula' },
        ]},
      ],
    },
  ],
}

const SEC_BOP_RETIRA: LSec = {
  id: 'bop_retira', label: 'BOP — RETIRADA', phase: 'Fase 2', color: 'amber',
  always: [
    { id: 'ABAN 236', name: 'Troca de fluido do riser' },
    { id: 'ABAN 203', name: 'BOP — Preparação e retirada' },
  ],
  decisions: [],
}

// ── MONTAGEM DOS ESCOPOS ────────────────────────────────────────────────────

const F1_PREFIX: LSec[] = [SEC_MOB_DP, SEC_DESCIDA, SEC_CONEXAO, SEC_GAB]
const F1_SUFFIX: LSec[] = [SEC_FLOWLINES, SEC_TMF]

export const LOGIC_BY_SCOPE: Record<string, LSec[]> = {
  FSU_TT_FT: [
    ...F1_PREFIX,
    SEC_CSB1_TT, SEC_LIMP, SEC_CORTE_TT, SEC_CSB2_TT,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FSU_TT_BDC: [
    ...F1_PREFIX,
    SEC_CSB1_TT, SEC_LIMP, SEC_BDC,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FS1_Mec: [
    ...F1_PREFIX,
    SEC_CSB1_FS1, SEC_LIMP, SEC_CORTE_FS1, SEC_CSB2_FS1,
    ...F1_SUFFIX, SEC_RET_FSU,
  ],
  FSU_Conv_BOP: [
    ...F1_PREFIX,
    SEC_CSB1_FS1, SEC_LIMP, SEC_CORTE_FS1, SEC_CSB2_FS1,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
  FSU_Conv_RCMA: [
    ...F1_PREFIX,
    SEC_RCMA_PRINCIPAL, SEC_CSB1_FS1, SEC_LIMP, SEC_CORTE_FS1, SEC_CSB2_FS1,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_RCMA_F2, SEC_ISOLATION,
  ],
  FSU_Sup_COP: [
    ...F1_PREFIX,
    SEC_CSB1_FS1, SEC_LIMP, SEC_CORTE_FS1, SEC_CSB2_FS1,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_CAUDA, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
  FSU_Sup_PWC: [
    ...F1_PREFIX,
    SEC_CSB1_FS1, SEC_LIMP, SEC_CORTE_FS1, SEC_CSB2_FS1,
    ...F1_SUFFIX, SEC_RET_CONV,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_CAUDA, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
  FS2_Conv_BOP: [
    SEC_MOB_DP,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_PACKER_FISHING, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
  FS2_Conv_RCMA: [
    SEC_MOB_DP,
    SEC_RCMA_F2, SEC_PACKER_FISHING, SEC_ISOLATION,
  ],
  FS2_Sup_COP: [
    SEC_MOB_DP,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_CAUDA, SEC_PACKER_FISHING, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
  FS2_Sup_PWC: [
    SEC_MOB_DP,
    SEC_BOP_INSTALA, SEC_FETH_COP, SEC_CAUDA, SEC_PACKER_FISHING, SEC_ISOLATION, SEC_BOP_RETIRA,
  ],
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
  'NOVO 015': 'NOVO 016',  // montagem SFT → montagem Terminal Head
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
function _secsForRig(scopeId: string, rig: 'ANC' | 'DP'): LSec[] {
  const secs = LOGIC_BY_SCOPE[scopeId] ?? []
  // A seção de mobilização é específica por sonda (DMA vs DMM+transponder), trocada por inteiro;
  // as demais seções, sob ANC, têm os pacotes trocados pelos equivalentes ANC.
  return secs.map(s => {
    if (s.id === 'mob') return rig === 'ANC' ? SEC_MOB_ANC : SEC_MOB_DP
    return rig === 'ANC' ? _mapSec(s, rig) : s
  })
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
