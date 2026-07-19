import { FlaskConical } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { setSessionRole } from '../utils/auth'

// ⚠️ ─────────────────────────────────────────────────────────────────────────────
// TEMPORÁRIO — HARNESS DE TESTE. REMOVER quando os sistemas forem conectados.
// ──────────────────────────────────────────────────────────────────────────────
// Em produção, um SISTEMA EXTERNO fornece: `wellName` (nome do poço), `projectName`
// (nome do projeto — pode haver vários por poço) e o PAPEL do usuário (`projetista`
// ou `admin`), que já está logado nesse outro sistema. Esses dados são usados para
// salvar o cronograma no servidor e para liberar/ocultar recursos de admin. Essa
// integração ainda não existe neste repositório.
//
// Enquanto ela não existe, este pop-up é exibido ao abrir a página para SIMULAR essa
// entrada externa: os campos despacham SET_WELL_NAME / SET_PROJECT_NAME / SET_ROLE +
// `setSessionRole` (que atualiza a sessão lida por `isAdmin()`) — exatamente o que a
// integração fará.
//
// AO CONECTAR A INTEGRAÇÃO EXTERNA:
//   1. Remover este componente e sua montagem em [src/App.tsx] (Main).
//   2. A integração passa a despachar SET_WELL_NAME / SET_PROJECT_NAME / SET_ROLE +
//      setSessionRole a partir do usuário já logado no outro sistema, ao carregar.
// Nada além disso precisa mudar: o autosave já lê `state.wellName`/`state.projectName`
// (ver [src/hooks/useProjectAutosave.ts]) e o gate de admin já lê `isAdmin()` da sessão.
// ──────────────────────────────────────────────────────────────────────────────
export function TestIdentityModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-dashed border-amber-400/70 dark:border-amber-500/40 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <FlaskConical size={16} className="text-amber-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Entrada simulada (teste)
          </span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/40 rounded px-1 py-0.5 leading-none shrink-0">
            Teste
          </span>
        </div>

        {/* Form */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Simula os dados que, em produção, virão de um sistema externo (poço, projeto
            e papel do usuário já logado). Remover quando essa integração existir.
          </p>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Poço
            </label>
            <input
              type="text"
              value={state.wellName}
              onChange={e => dispatch({ type: 'SET_WELL_NAME', wellName: e.target.value })}
              placeholder="Nome do poço"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 dark:focus:ring-amber-900 transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Projeto
            </label>
            <input
              type="text"
              value={state.projectName ?? ''}
              onChange={e => dispatch({ type: 'SET_PROJECT_NAME', projectName: e.target.value || undefined })}
              placeholder="Nome do projeto"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 dark:focus:ring-amber-900 transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Papel do usuário
            </label>
            <select
              value={state.role}
              onChange={e => {
                const role = e.target.value as 'admin' | 'projetista'
                setSessionRole(role)                     // atualiza a sessão lida por isAdmin()
                dispatch({ type: 'SET_ROLE', role })     // atualiza o estado → re-render dos gates
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 dark:focus:ring-amber-900 transition-colors"
            >
              <option value="projetista">Projetista</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="pt-1">
            <button type="button" onClick={onClose}
              className="w-full py-2 bg-[#0c2340] dark:bg-sky-800 text-white rounded-xl text-sm font-semibold hover:bg-[#0e3a60] dark:hover:bg-sky-700 transition-colors">
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
