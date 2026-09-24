import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parsePlist } from './scanner.js';
import { moveToTrash } from './trash.js';
import { humanAge, isRecent } from './report.js';

const COLOR = process.stdout.isTTY;
const rgb = (r, g, b, s) => (COLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);
const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const accent = (s) => rgb(167, 139, 250, s);
const chrome = (s) => rgb(107, 114, 128, s);
const warn = (s) => rgb(224, 168, 83, s);
const good = (s) => rgb(126, 200, 140, s);

// Diretórios de jobs do launchd. 'user' o gst pode remover; 'system' exige sudo.
const AGENT_DIRS = [
  { dir: join(homedir(), 'Library', 'LaunchAgents'), scope: 'user' },
  { dir: '/Library/LaunchAgents', scope: 'system' },
  { dir: '/Library/LaunchDaemons', scope: 'system' },
];

// Interpretadores: se forem o argv[0], o alvo real é um argumento seguinte.
const INTERPRETERS = new Set([
  '/bin/sh', '/bin/bash', '/bin/zsh', '/usr/bin/env', '/usr/bin/osascript',
  '/usr/bin/open', '/usr/bin/python', '/usr/bin/python3', '/usr/bin/ruby', '/usr/bin/perl',
]);

/** Descobre o executável alvo declarado no plist do job. */
function resolveTarget(info) {
  if (typeof info.Program === 'string') return info.Program;
  const args = info.ProgramArguments;
  if (Array.isArray(args) && args.length) {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('/') && !INTERPRETERS.has(first)) {
      return first;
    }
    // argv[0] é interpretador (ou relativo): pega o próximo caminho absoluto.
    const next = args.slice(1).find((a) => typeof a === 'string' && a.startsWith('/'));
    return next || first;
  }
  return null;
}

/**
 * Retorna os jobs do launchd cujo executável não existe mais no disco —
 * restos de apps/updaters removidos que ainda tentam rodar no login.
 * Cada item: { path, label, scope, target, mtimeMs }.
 */
export function findOrphanAgents({ includeApple = false } = {}) {
  const orphans = [];
  for (const { dir, scope } of AGENT_DIRS) {
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.plist')) continue;
      const path = join(dir, file);
      const info = parsePlist(path);
      if (!info) continue;

      const label = typeof info.Label === 'string' ? info.Label : file.replace(/\.plist$/, '');
      if (!includeApple && label.toLowerCase().startsWith('com.apple.')) continue;

      const target = resolveTarget(info);
      // Só sinalizamos quando há um caminho absoluto claro que sumiu — evita
      // falso positivo com comandos que vivem no PATH.
      if (!target || !target.startsWith('/')) continue;
      if (existsSync(target)) continue;

      let mtimeMs = null;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {}
      orphans.push({ path, label, scope, target, mtimeMs });
    }
  }
  return orphans.sort((a, b) => a.label.localeCompare(b.label));
}

/** Descarrega um job do usuário (best-effort) antes de remover o plist. */
function unloadUserAgent(path) {
  try {
    execFileSync('launchctl', ['bootout', `gui/${process.getuid()}`, path], {
      stdio: 'ignore',
    });
  } catch {
    // job pode já não estar carregado — tudo bem
  }
}

export { unloadUserAgent, AGENT_DIRS };

export function trashUserAgents(paths) {
  paths.forEach(unloadUserAgent);
  moveToTrash(paths);
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^s(im)?$/i.test(ans.trim()));
    });
  });
}

/** `gst agents` — lista (e opcionalmente remove) jobs órfãos do launchd. */
export async function cmdAgents({ clean = false } = {}) {
  const orphans = findOrphanAgents();
  console.log();
  console.log(`  ${accent('👻 gst agents')}  ${chrome('· jobs de login apontando para binário inexistente')}`);
  console.log();

  if (!orphans.length) {
    console.log(`  ${chrome('Nenhum job órfão. Seu login está limpo. 🎉')}\n`);
    return;
  }

  const user = orphans.filter((o) => o.scope === 'user');
  const system = orphans.filter((o) => o.scope === 'system');

  for (const [title, group] of [['Do usuário (removível)', user], ['Do sistema (precisa de sudo)', system]]) {
    if (!group.length) continue;
    console.log(`  ${bold(title)}`);
    for (const o of group) {
      const age = isRecent(o.mtimeMs) ? warn('⚠ ' + humanAge(o.mtimeMs)) : chrome(humanAge(o.mtimeMs));
      console.log(`    ${accent('•')} ${o.label}  ${chrome(age)}`);
      console.log(`      ${chrome('alvo sumido:')} ${chrome(o.target)}`);
    }
    console.log();
  }

  if (!clean) {
    console.log(`  ${chrome(`${orphans.length} órfão(s).`)} ${chrome('Rode')} ${bold('gst agents --clean')} ${chrome('para remover.')}\n`);
    return;
  }

  if (user.length && process.stdin.isTTY) {
    const ok = await askYesNo(
      `  Mover ${bold(String(user.length))} job(s) do usuário para a Lixeira? ${chrome('(s/N) ')}`,
    );
    if (ok) {
      try {
        trashUserAgents(user.map((o) => o.path));
        console.log(`  ${good('✓')} ${user.length} job(s) descarregado(s) e movido(s) para a Lixeira.`);
      } catch (err) {
        console.error(`  Falha ao remover: ${err.message}`);
      }
    } else {
      console.log(`  ${chrome('Nada removido.')}`);
    }
  }

  if (system.length) {
    console.log(`\n  ${bold('Jobs do sistema precisam de você (sudo):')}`);
    for (const o of system) {
      console.log(`    ${chrome('sudo launchctl bootout system')} ${o.path}`);
      console.log(`    ${chrome('sudo rm')} ${o.path}`);
    }
  }
  console.log();
}
