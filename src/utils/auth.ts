// Sessão/autenticação com papéis (admin/projetista).
// Quando há backend (VITE_API_URL), faz login na API; sem backend (ou servidor
// fora do ar), cai no login legado offline com papel "projetista".
import { isApiConfigured } from './api'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const KEY = 'sprint_session'

export type Role = 'admin' | 'projetista'
export interface Session { token: string; role: Role; username: string }

// Credencial legada (mantém o acesso offline existente quando não há backend).
const LEGACY = { user: 'teste', pass: 'teste123' }

export async function login(username: string, password: string): Promise<Session> {
  if (isApiConfigured()) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))
      if (res.ok) {
        const body = await res.json()
        return persist({ token: body.token, role: body.role, username: body.username })
      }
      if (res.status === 401) throw new Error('Usuário ou senha incorretos.')
      throw new Error(`Erro ${res.status}`)
    } catch (e) {
      // Credencial inválida → propaga; erro de rede (servidor fora) → tenta o fallback legado.
      if (e instanceof Error && e.message.includes('incorretos')) throw e
    }
  }
  if (username.trim() === LEGACY.user && password === LEGACY.pass) {
    return persist({ token: '', role: 'projetista', username: username.trim() })
  }
  throw new Error('Usuário ou senha incorretos.')
}

function persist(s: Session): Session {
  sessionStorage.setItem(KEY, JSON.stringify(s))
  return s
}

export function getSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null
  } catch {
    return null
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY)
}

export function ensureDefaultSession(): void {
  if (!getSession()) persist({ token: '', role: 'admin', username: 'local' })
}

export function getRole(): Role | null {
  return getSession()?.role ?? null
}

// TEMPORÁRIO (harness de teste — remover quando o sistema externo for conectado):
// define o papel do usuário simulando a entrada do outro sistema, onde ele já está
// logado. Em produção, a integração fornecerá o papel diretamente. Mantém token/
// username existentes para não quebrar `authHeader()`.
export function setSessionRole(role: Role): void {
  const s = getSession()
  persist({ token: s?.token ?? '', role, username: s?.username ?? 'local' })
}

export function isAdmin(): boolean {
  return getRole() === 'admin'
}

/** Cabeçalho Authorization para chamadas protegidas (vazio se sem token). */
export function authHeader(): Record<string, string> {
  const s = getSession()
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {}
}
