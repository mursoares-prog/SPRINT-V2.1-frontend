import { useState } from 'react'
import { Eye, EyeOff, X, ShieldAlert } from 'lucide-react'
import { login, type Session } from '../utils/auth'

export function LoginModal({ onLogin, onClose }: {
  onLogin: (session: Session) => void
  onClose: () => void
}) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await login(user, pass)
      onLogin(session)
    } catch (err) {
      setError((err as Error).message || 'Falha ao entrar.')
      setPass('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <ShieldAlert size={16} className="text-amber-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Autenticação necessária
          </span>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sua sessão expirou ou você não tem permissão. Faça login para continuar.
          </p>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Usuário
            </label>
            <input
              type="text"
              value={user}
              onChange={e => { setUser(e.target.value); setError('') }}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors ${error ? 'border-red-300 dark:border-red-700 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-sky-400 focus:ring-sky-200 dark:focus:ring-sky-900'}`}
              placeholder="usuário"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => { setPass(e.target.value); setError('') }}
                className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors ${error ? 'border-red-300 dark:border-red-700 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-sky-400 focus:ring-sky-200 dark:focus:ring-sky-900'}`}
                placeholder="senha"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 font-semibold">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !user || !pass}
              className="flex-1 py-2 bg-[#0c2340] dark:bg-sky-800 text-white rounded-xl text-sm font-semibold hover:bg-[#0e3a60] dark:hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {loading ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
