import readline from 'node:readline';
import { findOrphans } from './diff.js';
import { fmtSize } from './report.js';
import { moveToTrash } from './trash.js';

// --- Cor (truecolor, só em TTY) ---------------------------------------------
const COLOR = process.stdout.isTTY;
const rgb = (r, g, b, s) => (COLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);
const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const inv = (s) => (COLOR ? `\x1b[7m${s}\x1b[0m` : `> ${s}`);
const accent = (s) => rgb(167, 139, 250, s);
const chrome = (s) => rgb(107, 114, 128, s);
const good = (s) => rgb(126, 200, 140, s);

/** Agrupa as órfãs por bundle id: um app = várias pastas somadas. */
function groupByApp(orphans) {
  const map = new Map();
  for (const o of orphans) {
    let g = map.get(o.key);
    if (!g) {
      g = { key: o.key, sizeKb: 0, paths: [], categories: new Set() };
      map.set(o.key, g);
    }
    g.sizeKb += o.sizeKb;
    g.paths.push(o.path);
    g.categories.add(o.category);
  }
  return [...map.values()].sort((a, b) => b.sizeKb - a.sizeKb);
}

const truncate = (s, max) => (s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…');

/**
 * Seletor interativo. Resolve com a lista de apps escolhidos (ou [] se cancelar).
 */
function pick(apps) {
  return new Promise((resolve) => {
    let cursor = 0;
    let offset = 0;
    const selected = new Set();
    let prevLines = 0;

    const rows = () => process.stdout.rows || 24;
    const cols = () => process.stdout.columns || 80;
    // Reserva: título+ajuda+branco (3) + "…abaixo" (1) + branco+status (2) = 6,
    // e mais 1 para a quebra final nunca rolar a tela.
    const viewport = () => Math.max(3, rows() - 7);

    function frame() {
      const lines = [];
      const selCount = selected.size;
      const selSize = apps.filter((_, i) => selected.has(i)).reduce((s, a) => s + a.sizeKb, 0);

      const vp = viewport();
      if (cursor < offset) offset = cursor;
      if (cursor >= offset + vp) offset = cursor - vp + 1;

      const pos = chrome(`${offset + 1}–${Math.min(offset + vp, apps.length)} de ${apps.length}`);
      lines.push(`  ${accent('👻 gst clean')}  ${chrome('· marque o que remover')}  ${pos}`);
      lines.push(`  ${chrome('↑/↓ move · espaço marca · a todos · enter ok · q sai')}`);
      lines.push(offset > 0 ? chrome(`  … +${offset} acima`) : '');

      const sizeW = apps.reduce((w, a) => Math.max(w, fmtSize(a.sizeKb).length), 0);
      const visible = apps.slice(offset, offset + vp);
      visible.forEach((a, i) => {
        const idx = offset + i;
        const box = selected.has(idx) ? good('◉') : chrome('◯');
        const size = fmtSize(a.sizeKb).padStart(sizeW);
        const cats = chrome(`(${[...a.categories].length})`);
        const nameMax = cols() - 2 - 2 - sizeW - 1 - 2 - 4;
        const name = truncate(a.key, nameMax);
        let row = `${box}  ${size}  ${name} ${cats}`;
        row = idx === cursor ? inv(' ' + row + ' ') : '  ' + row;
        lines.push(row);
      });
      if (apps.length > offset + vp) lines.push(chrome(`  … +${apps.length - offset - vp} abaixo`));

      lines.push('');
      lines.push(
        selCount
          ? `  ${bold(good(String(selCount)))} ${chrome('apps marcados')}  ${chrome('·')}  ${bold(accent(fmtSize(selSize)))} ${chrome('para a Lixeira')}`
          : `  ${chrome('nada marcado ainda')}`,
      );
      return lines.map((l) => truncate(l, cols() + 40)).join('\n'); // +40: cor não conta na largura
    }

    function render() {
      const out = frame();
      const n = out.split('\n').length;
      if (prevLines) process.stdout.write(`\x1b[${prevLines}A\x1b[0J`);
      process.stdout.write(out + '\n');
      prevLines = n;
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKey);
    }

    function onKey(str, key) {
      const name = key?.name;
      if (name === 'up' || str === 'k') cursor = (cursor - 1 + apps.length) % apps.length;
      else if (name === 'down' || str === 'j') cursor = (cursor + 1) % apps.length;
      else if (name === 'space') {
        selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor);
      } else if (str === 'a') {
        if (selected.size === apps.length) selected.clear();
        else apps.forEach((_, i) => selected.add(i));
      } else if (name === 'return' || name === 'enter') {
        cleanup();
        return resolve([...selected].map((i) => apps[i]));
      } else if (str === 'q' || name === 'escape' || (key?.ctrl && name === 'c')) {
        cleanup();
        return resolve([]);
      }
      render();
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    render();
  });
}

/** Pergunta sim/não numa linha. */
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^s(im)?$/i.test(ans.trim()));
    });
  });
}

export async function cmdClean({ includeLow = false } = {}) {
  if (!process.stdin.isTTY) {
    console.error('O modo interativo precisa de um terminal. Rode `gst clean` direto no terminal.');
    process.exit(1);
  }

  process.stderr.write('Varrendo…\r');
  const orphans = await findOrphans();
  process.stderr.write('        \r');
  const pool = includeLow ? orphans : orphans.filter((o) => o.confidence === 'high');

  if (!pool.length) {
    console.log(`\n  ${accent('👻 gst')}  ${chrome('nenhum fantasma para limpar. 🎉')}\n`);
    return;
  }

  const apps = groupByApp(pool);
  console.log();
  const chosen = await pick(apps);

  if (!chosen.length) {
    console.log(`\n  ${chrome('Cancelado. Nada foi apagado.')}\n`);
    return;
  }

  const paths = chosen.flatMap((a) => a.paths);
  const total = chosen.reduce((s, a) => s + a.sizeKb, 0);

  console.log(`\n  ${bold('Vai para a Lixeira:')}`);
  for (const a of chosen) {
    console.log(`    ${chrome('•')} ${a.key}  ${chrome(fmtSize(a.sizeKb) + ' · ' + a.paths.length + ' pastas')}`);
  }
  console.log(
    `\n  ${bold(accent(fmtSize(total)))} ${chrome('em')} ${paths.length} ${chrome('pastas.')} ${chrome('Dá pra recuperar pela Lixeira.')}`,
  );

  const ok = await confirm(`\n  Confirmar? ${chrome('(s/N) ')}`);
  if (!ok) {
    console.log(`\n  ${chrome('Cancelado. Nada foi apagado.')}\n`);
    return;
  }

  try {
    moveToTrash(paths);
    console.log(`\n  ${good('✓')} ${bold(fmtSize(total))} ${good('movidos para a Lixeira.')}\n`);
  } catch (err) {
    console.error(`\n  Falha ao mover para a Lixeira: ${err.message}`);
    console.error(`  ${chrome('Verifique as permissões de automação do Finder e tente de novo.')}\n`);
    process.exit(1);
  }
}
