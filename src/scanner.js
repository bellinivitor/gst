import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Locais onde macOS guarda apps. Apps podem estar aninhados (ex.: /Applications/Foo/Bar.app),
// então varremos recursivamente até uma profundidade razoável.
const APP_DIRS = [
  '/Applications',
  '/System/Applications',
  join(homedir(), 'Applications'),
];

const MAX_DEPTH = 4;

/**
 * Converte um Info.plist (binário ou XML) para objeto JS via `plutil`.
 * Retorna null se o arquivo não puder ser lido/parseado.
 */
export function parsePlist(plistPath) {
  try {
    const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Extrai o CFBundleIdentifier de um bundle .app.
 */
export function bundleIdOf(appPath) {
  const infoPlist = join(appPath, 'Contents', 'Info.plist');
  if (!existsSync(infoPlist)) return null;
  const info = parsePlist(infoPlist);
  const id = info?.CFBundleIdentifier;
  return typeof id === 'string' && id.length > 0 ? id.toLowerCase() : null;
}

/**
 * Percorre um diretório procurando bundles .app (sem descer dentro dos .app).
 */
function findAppBundles(dir, depth, out) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // sem permissão ou não existe
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.name.endsWith('.app')) {
      out.push(full);
      continue; // não descemos dentro do bundle
    }
    // ignora diretórios ocultos para não perder tempo
    if (entry.name.startsWith('.')) continue;
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (isDir) findAppBundles(full, depth + 1, out);
  }
}

/**
 * Retorna a lista de apps instalados com { path, bundleId }.
 */
export function getInstalledApps() {
  const bundles = [];
  for (const dir of APP_DIRS) {
    findAppBundles(dir, 0, bundles);
  }
  const seen = new Set();
  const apps = [];
  for (const path of bundles) {
    if (seen.has(path)) continue;
    seen.add(path);
    const bundleId = bundleIdOf(path);
    if (bundleId) apps.push({ path, bundleId });
  }
  return apps;
}

/**
 * Conjunto (Set) com os bundle ids instalados, em minúsculas.
 */
export function getInstalledBundleIds() {
  return new Set(getInstalledApps().map((a) => a.bundleId));
}
