import { useState } from 'react'
import { FlaskConical, Loader2, MonitorPlay } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { setSessionRole } from '../utils/auth'
import { lookupServerProject, isApiConfigured } from '../utils/api'
import { isDemoMode, setDemoMode, seedDemoData } from '../utils/demoMode'

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
// Ao confirmar (Continuar), busca no servidor um projeto já salvo para o par
// poço+projeto informado (identidade do sistema externo — pode haver vários projetos
// por poço). Se existir, resgata a última versão salva (o servidor não versiona
// projetos: cada save sobrescreve o mesmo registro) e reabre exatamente onde a edição
// parou — LOAD_PROJECT decide a tela (fine_tuning se há detalhamento salvo, senão
// schedule) porque o autosave só grava a partir do cronograma gerado (nunca durante o
// wizard). Se não existir, segue o fluxo normal (novo projeto, começa no wizard).
//
// AO CONECTAR A INTEGRAÇÃO EXTERNA:
//   1. Remover este componente e sua montagem em [src/App.tsx] (Main).
//   2. A integração passa a despachar SET_WELL_NAME / SET_PROJECT_NAME / SET_ROLE +
//      setSessionRole a partir do usuário já logado no outro sistema, ao carregar —
//      e deve reproduzir a busca+LOAD_PROJECT abaixo (`checkExistingProject`) para que
//      reabrir um poço+projeto já iniciado não comece um projeto novo do zero.
// Fora isso, nada mais precisa mudar: o autosave já lê `state.wellName`/`state.projectName`
// (ver [src/hooks/useProjectAutosave.ts]) e o gate de admin já lê `isAdmin()` da sessão.
// ──────────────────────────────────────────────────────────────────────────────
export function TestIdentityModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const [checking, setChecking] = useState(false)
  // TEMPORÁRIO — modo demonstração (só faz sentido sem backend). Ligar semeia os stores
  // a partir do bundle para que Etapa 1 + árvores de decisão apareçam como se conectadas.
  const backendOff = !isApiConfigured()
  const [demo, setDemo] = useState(isDemoMode)
  const toggleDemo = () => {
    const next = !demo
    setDemo(next)
    setDemoMode(next)
    if (next) seedDemoData()   // aplica agora; o wizard lê os stores ao fechar o pop-up
  }

  // Se já existe projeto salvo para este poço+projeto, resgata a última versão e
  // reabre na tela onde parou; senão segue o fluxo normal (novo projeto).
  const checkExistingProject = async () => {
    const wellName = state.wellName.trim()
    const projectName = (state.projectName ?? '').trim()
    if (!wellName || !projectName || !isApiConfigured()) return
    setChecking(true)
    try {
      const existing = await lookupServerProject(wellName, projectName)
      if (existing) {
        dispatch({
          type: 'LOAD_PROJECT',
          wellName: existing.wellName,
          inputs: existing.inputs,
          schedule: existing.schedule,
          projectData: existing.projectData,
          fineTuningItems: existing.fineTuningItems,
          projectId: existing.id,
          projectName: existing.projectName,
          placeholderDefs: existing.placeholderDefs,
        })
      }
    } catch { /* offline/erro → segue como projeto novo, não bloqueia a entrada */ }
    finally { setChecking(false) }
  }

  const handleContinue = () => { void checkExistingProject().then(onClose) }

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

          {/* Modo demonstração — só quando o backend está desativado (sem VITE_API_URL). */}
          {backendOff && (
            <button
              type="button"
              onClick={toggleDemo}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                demo
                  ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <MonitorPlay size={16} className={demo ? 'text-emerald-600 dark:text-emerald-400 shrink-0' : 'text-slate-400 shrink-0'} />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Modo demonstração
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Exibe a Etapa 1 e as árvores de decisão a partir dos dados empacotados, sem servidor.
                </span>
              </span>
              <span className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${demo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${demo ? 'left-4' : 'left-0.5'}`} />
              </span>
            </button>
          )}

          <div className="pt-1">
            <button type="button" onClick={handleContinue} disabled={checking}
              className="w-full py-2 flex items-center justify-center gap-2 bg-[#0c2340] dark:bg-sky-800 text-white rounded-xl text-sm font-semibold hover:bg-[#0e3a60] dark:hover:bg-sky-700 transition-colors disabled:opacity-60">
              {checking && <Loader2 size={14} className="animate-spin" />}
              {checking ? 'Verificando projeto existente…' : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
