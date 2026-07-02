import type { ScopeId } from '../types'

// Rótulos amigáveis dos escopos bundle, exibidos no wizard e no FineTuning.
// Mantido fora do App.tsx para que o arquivo de componente exporte só componentes
// (requisito do Fast Refresh).
export const SCOPE_LABEL: Record<ScopeId, string> = {
  FSU_TT_FT:    'TT Flexitubo (TT-FT)',
  FSU_TT_BDC:   'TT Bombeio Direto (TT-BDC)',
  FSU_Conv_BOP:  'Convencional com BOP',
  FSU_Conv_RCMA: 'Convencional com RCMA',
  FSU_Sup_COP:   'Superconvencional (COP Interior/Inferior)',
  FSU_Sup_PWC:   'Superconvencional (Recimentação/PWC)',
  FS1_Mec:       'Tampões Mecânicos',
  FS2_Conv_BOP:  'Convencional com BOP',
  FS2_Conv_RCMA: 'Convencional com RCMA',
  FS2_Sup_COP:   'Superconvencional (COP Interior/Inferior)',
  FS2_Sup_PWC:   'Superconvencional (Recimentação/PWC)',
}
