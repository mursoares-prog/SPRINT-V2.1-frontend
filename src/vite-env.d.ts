/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base do backend (FastAPI). Vazio = persistência só por arquivo. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
