import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { login, type Session } from '../utils/auth'

function SemisubIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M12 2 L9 8 L15 8 Z" />
      <line x1="10.5" y1="5.5" x2="13.5" y2="5.5" />
      <rect x="3" y="8" width="18" height="1.5" rx="0.4" />
      <rect x="5.5" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="15" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="2.5" y="15.5" width="9" height="3.5" rx="1.75" />
      <rect x="12.5" y="15.5" width="9" height="3.5" rx="1.75" />
    </svg>
  )
}

export function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('Usuário ou senha incorretos.')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const session = await login(user, pass)
      onLogin(session)
    } catch (err) {
      setErrorMsg((err as Error).message || 'Falha ao entrar.')
      setError(true)
      setPass('')
      setLoading(false)
    }
  }

  const clearError = () => setError(false)

  return (
    <div className="flex items-center justify-center h-[100dvh] bg-[#e4e9e3] dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0c2340] flex items-center justify-center shadow-lg">
            <SemisubIcon size={28} className="text-[#d97706]" />
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            className="text-4xl font-bold tracking-[0.15em] text-[#0c2340] dark:text-white uppercase">
            SPRINT
          </h1>
          <p className="text-xs font-semibold tracking-[0.2em] text-[#d97706] uppercase">
            Sistema de Planejamento de Abandono e Workover
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit}
          className="bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7 space-y-4">

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1.5">
              Usuário
            </label>
            <input
              type="text"
              value={user}
              onChange={e => { setUser(e.target.value); clearError() }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm
                bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200
                placeholder:text-slate-500 dark:placeholder:text-slate-600
                focus:outline-none focus:ring-1 transition-colors
                ${error
                  ? 'border-red-300 dark:border-red-700 focus:border-red-400 focus:ring-red-200 dark:focus:ring-red-900'
                  : 'border-slate-200 dark:border-slate-600 focus:border-sky-400 focus:ring-sky-200 dark:focus:ring-sky-900'}`}
              placeholder="usuário"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest block mb-1.5">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => { setPass(e.target.value); clearError() }}
                className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm
                  bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200
                  placeholder:text-slate-500 dark:placeholder:text-slate-600
                  focus:outline-none focus:ring-1 transition-colors
                  ${error
                    ? 'border-red-300 dark:border-red-700 focus:border-red-400 focus:ring-red-200 dark:focus:ring-red-900'
                    : 'border-slate-200 dark:border-slate-600 focus:border-sky-400 focus:ring-sky-200 dark:focus:ring-sky-900'}`}
                placeholder="senha"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-500 transition-colors">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 font-semibold -mt-1">
              {errorMsg}
            </p>
          )}

          <button type="submit" disabled={loading || !user || !pass}
            className="w-full py-2.5 bg-[#0c2340] dark:bg-sky-800 text-white rounded-xl text-sm font-semibold
              hover:bg-[#0e3a60] dark:hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

      </div>
    </div>
  )
}
