import { execFile, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TRASH = join(homedir(), '.Trash');

const COLOR = process.stdout.isTTY;
const rgb = (r, g, b, s) => (COLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);
const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const accent = (s) => rgb(167, 139, 250, s);
const chrome = (s) => rgb(107, 114, 128, s);
const good = (s) => rgb(126, 200, 140, s);

function fmtSize(kb) {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + ' GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb + ' KB';
}

/** Move caminhos para a Lixeira via Finder (preserva "Colocar de volta"). */
export function moveToTrash(paths) {
  if (!paths.length) return;
  const items = paths.map(
    (p) => `POSIX file "${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  );
  const script = `tell application "Finder" to delete {${items.join(', ')}}`;
  execFileSync('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Esvazia a Lixeira via Finder (irreversível). */
export function emptyTrash() {
  execFileSync('osascript', ['-e', 'tell application "Finder" to empty trash'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/** Tamanho (KB) e nº de itens no topo da Lixeira do usuário. */
export function trashStats() {
  return new Promise((resolve) => {
    execFile('du', ['-sk', TRASH], { timeout: 30000 }, (_err, stdout) => {
      const kb = parseInt(String(stdout).split('\t')[0], 10) || 0;
      execFile('ls', ['-1', TRASH], (_e, out) => {
        const items = String(out).split('\n').filter(Boolean).length;
        resolve({ kb, items });
      });
    });
  });
}

/** `gst trash` — mostra o tamanho da Lixeira e esvazia (irreversível). */
export async function cmdTrash({ yes = false } = {}) {
  const { kb, items } = await trashStats();
  console.log();
  console.log(`  ${accent('👻 gst trash')}`);
  if (items === 0) {
    console.log(`  ${chrome('A Lixeira já está vazia. 🎉')}\n`);
    return;
  }
  console.log(
    `  ${bold(accent(fmtSize(kb)))} ${chrome('em')} ${bold(String(items))} ${chrome('item(ns) na Lixeira.')}`,
  );
  console.log(`  ${chrome('Esvaziar é')} ${bold('irreversível')} ${chrome('— não dá para recuperar depois.')}`);

  if (!yes) {
    if (!process.stdin.isTTY) {
      console.log(`\n  ${chrome('Rode')} ${bold('gst trash --yes')} ${chrome('para esvaziar.')}\n`);
      return;
    }
    const ok = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`\n  Esvaziar agora? Digite ${bold('esvaziar')} para confirmar: `, (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase() === 'esvaziar');
      });
    });
    if (!ok) {
      console.log(`\n  ${chrome('Cancelado. A Lixeira continua intacta.')}\n`);
      return;
    }
  }

  try {
    emptyTrash();
    console.log(`\n  ${good('✓')} ${bold('Lixeira esvaziada.')} ${chrome(fmtSize(kb) + ' liberados.')}\n`);
  } catch (err) {
    console.error(`\n  Falha ao esvaziar: ${err.message}\n`);
    process.exit(1);
  }
}
