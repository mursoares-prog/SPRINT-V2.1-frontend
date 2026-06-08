// Tipos de cabo/corte de EDS — índice 0-based (fonte única).
// Usado pela UI (seletor "Tipo de EDS" na Etapa 3) e pelo export OpenWells
// (activity/eds.info[].selected = [índice, rótulo]). O índice↔rótulo precisa
// casar com a tabela do sistema importador (ex.: 1 = "UBSR / BSR").
export const EDS_TYPES: string[] = [
  'Sem Corte',                 // 0
  'UBSR / BSR',                // 1
  'CSR',                       // 2
  'LSR',                       // 3
  'CSR + UBSR / CSR + BSR',    // 4
  'LBSR + UBSR',               // 5
  'UBSR + LBSR',               // 6
  'CSR + LBSR',                // 7
  'CSR + BSR com delay EDS',   // 8
]
