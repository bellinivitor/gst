import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LIB = join(homedir(), 'Library');

/**
 * Categorias do Library que varremos. Cada uma diz:
 *  - dir: caminho absoluto
 *  - kind: 'dir' (subpastas) ou 'plist' (arquivos .plist soltos, ex.: Preferences)
 *  - naming: 'bundle-id' (nome da entrada é o bundle id) ou 'app-name' (nome do app,
 *            heurística mais fraca — usado em Application Support e Logs)
 */
export const CATEGORIES = [
  { name: 'Containers', dir: join(LIB, 'Containers'), kind: 'dir', naming: 'bundle-id' },
  { name: 'Application Support', dir: join(LIB, 'Application Support'), kind: 'dir', naming: 'app-name' },
  { name: 'Caches', dir: join(LIB, 'Caches'), kind: 'dir', naming: 'bundle-id' },
  { name: 'Preferences', dir: join(LIB, 'Preferences'), kind: 'plist', naming: 'bundle-id' },
  { name: 'Saved Application State', dir: join(LIB, 'Saved Application State'), kind: 'dir', naming: 'bundle-id' },
  { name: 'WebKit', dir: join(LIB, 'WebKit'), kind: 'dir', naming: 'bundle-id' },
  { name: 'HTTPStorages', dir: join(LIB, 'HTTPStorages'), kind: 'dir', naming: 'bundle-id' },
  { name: 'Logs', dir: join(LIB, 'Logs'), kind: 'dir', naming: 'app-name' },
];

// Sufixos que aparecem coladas ao bundle id em algumas categorias.
const SUFFIXES = ['.savedState', '.plist', '.binarycookies'];

/** Remove sufixos conhecidos do nome da entrada para chegar no bundle id/chave. */
function stripSuffix(name) {
  for (const suf of SUFFIXES) {
    if (name.endsWith(suf)) return name.slice(0, -suf.length);
  }
  return name;
}

/** Heurística: parece um bundle id reverse-DNS? (ao menos um ponto, sem espaços) */
export function looksLikeBundleId(key) {
  return /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(key);
}

/**
 * Enumera todas as entradas das categorias do Library.
 * Retorna [{ category, naming, path, name, key, isBundleId }].
 * Não calcula tamanho aqui (isso é feito só para as órfãs, no diff).
 */
export function walkLibrary() {
  const entries = [];
  for (const cat of CATEGORIES) {
    let dirents;
    try {
      dirents = readdirSync(cat.dir, { withFileTypes: true });
    } catch {
      continue; // categoria pode não existir nesta máquina
    }
    for (const d of dirents) {
      const name = d.name;
      if (name.startsWith('.')) continue; // .DS_Store etc.
      if (cat.kind === 'plist') {
        if (!name.endsWith('.plist')) continue;
      } else {
        if (!d.isDirectory() && !d.isSymbolicLink()) continue;
      }
      const key = stripSuffix(name).toLowerCase();
      if (!key) continue;
      entries.push({
        category: cat.name,
        naming: cat.naming,
        path: join(cat.dir, name),
        name,
        key,
        isBundleId: looksLikeBundleId(key),
      });
    }
  }
  return entries;
}
