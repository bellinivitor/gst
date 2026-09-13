import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { getInstalledApps } from './scanner.js';
import { walkLibrary } from './library-walker.js';

/** Prefixos de bundle id considerados "sistema" e excluídos por padrão. */
const SYSTEM_PREFIXES = ['com.apple.', 'group.com.apple.'];

function isSystem(key) {
  return SYSTEM_PREFIXES.some((p) => key.startsWith(p)) || key === 'com.apple';
}

/**
 * A pasta pertence a um app instalado?
 * Verdadeiro se o bundle id bate exatamente OU se é filho de um id instalado
 * (ex.: 'com.microsoft.teams2.widgetextension' pertence a 'com.microsoft.teams2').
 * Só consideramos ancestrais com >= 2 segmentos para evitar casar prefixos genéricos.
 */
function belongsToInstalled(key, installedIds) {
  if (installedIds.has(key)) return true;
  const parts = key.split('.');
  for (let i = parts.length - 1; i >= 2; i--) {
    if (installedIds.has(parts.slice(0, i).join('.'))) return true;
  }
  return false;
}

/** Tamanho em disco (KB) via `du -sk`, com timeout. Resolve 0 em erro/timeout. */
function sizeKb(path, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile('du', ['-sk', path], { timeout: timeoutMs, killSignal: 'SIGKILL' }, (err, stdout) => {
      if (err && !stdout) return resolve(0);
      const kb = parseInt(String(stdout).split('\t')[0], 10);
      resolve(Number.isFinite(kb) ? kb : 0);
    });
  });
}

/** Aplica uma função async sobre itens com concorrência limitada. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Cruza as entradas do Library contra os apps instalados e retorna as órfãs
 * com tamanho, ordenadas do maior para o menor.
 *
 * confidence:
 *  - 'high' quando o nome é um bundle id (cruzamento confiável)
 *  - 'low'  quando é nome de app (heurística, pode gerar falso positivo)
 */
export async function findOrphans({ includeSystem = false, concurrency = 12 } = {}) {
  const apps = getInstalledApps();
  const installedIds = new Set(apps.map((a) => a.bundleId));
  const installedNames = new Set(
    apps.map((a) => basename(a.path).replace(/\.app$/i, '').toLowerCase()),
  );

  const candidates = [];
  for (const e of walkLibrary()) {
    if (!includeSystem && isSystem(e.key)) continue;
    const installed = e.isBundleId
      ? belongsToInstalled(e.key, installedIds)
      : installedNames.has(e.key);
    if (installed) continue;
    candidates.push(e);
  }

  const sizes = await mapLimit(candidates, concurrency, (e) => sizeKb(e.path));
  const orphans = candidates.map((e, idx) => ({
    ...e,
    confidence: e.isBundleId ? 'high' : 'low',
    sizeKb: sizes[idx],
  }));

  orphans.sort((a, b) => b.sizeKb - a.sizeKb);
  return orphans;
}
