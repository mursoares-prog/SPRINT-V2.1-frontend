// Store das definições de campo do assistente de preenchimento (Etapa 3).
//
// A aba Place Holders do Admin edita `placeholder_field_defs` no servidor; esta é a
// cópia ativa no cliente, carregada no boot (ver App.tsx, junto de setPackageLines).
// Sem servidor configurado, fica vazia e o assistente usa o fallback hardcoded.
//
// É a fonte da ESTRUTURA do assistente (grupos, ordem, rótulo, unidade, tipo, opções);
// o snapshot por-projeto (ProjectFile.placeholderDefs) tem precedência quando presente
// — ver getActivePlaceholderDefs em engines/assistantFields.
import type { PlaceholderFieldDef } from '../utils/api'
import BUNDLED from './placeholderDefs.json'

// Default empacotado (snapshot do seed do servidor) — garante que o assistente funcione
// offline / sem API. No boot, é substituído pela versão do servidor (setPlaceholderDefs).
let active: PlaceholderFieldDef[] = BUNDLED as PlaceholderFieldDef[]

/** Config ativa (a do servidor, se carregada; senão vazia). */
export function getPlaceholderDefs(): PlaceholderFieldDef[] {
  return active
}

/** Substitui a config ativa (chamado no boot com a versão do servidor). */
export function setPlaceholderDefs(defs: PlaceholderFieldDef[] | null | undefined): void {
  if (Array.isArray(defs)) active = defs
}

/** Config a usar: o snapshot do projeto (congelado na criação) quando presente; senão
 *  a config live do servidor (fallback para projetos antigos, sem snapshot). */
export function resolvePlaceholderDefs(snapshot?: PlaceholderFieldDef[] | null): PlaceholderFieldDef[] {
  return snapshot && snapshot.length > 0 ? snapshot : active
}
