/** Formata KB em unidade legível, com casas decimais consistentes. */
export function fmtSize(kb) {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + ' GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb + ' KB';
}

// --- Cor (truecolor ANSI, só quando a saída é um terminal) -------------------
const COLOR = process.stdout.isTTY;
const rgb = (r, g, b, s) => (COLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);
const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);

// Paleta espectral: o brilho codifica o tamanho.
const ink = {
  big: (s) => rgb(167, 139, 250, s), // violeta vivo  — ofensores grandes
  mid: (s) => rgb(124, 116, 196, s), // violeta médio
  small: (s) => rgb(120, 128, 145, s), // cinza — pequenos
  chrome: (s) => rgb(107, 114, 128, s), // slate — categorias, metadados
  faint: (s) => rgb(75, 85, 99, s), // trilho das barras
  accent: (s) => rgb(167, 139, 250, s), // destaque / totais
};

/** Escolhe o tom conforme a magnitude (KB). */
function tier(kb) {
  if (kb >= 100 * 1024) return ink.big;
  if (kb >= 10 * 1024) return ink.mid;
  return ink.small;
}

// Rótulos curtos por categoria, pra caber na coluna da direita.
const CAT_SHORT = {
  Containers: 'Containers',
  'Application Support': 'App Support',
  Caches: 'Caches',
  Preferences: 'Preferences',
  'Saved Application State': 'Saved State',
  WebKit: 'WebKit',
  HTTPStorages: 'HTTPStorages',
  Logs: 'Logs',
};

const EIGHTHS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/**
 * Barra de proporção com resolução de 1/8 de bloco, colorida pela magnitude.
 * Escala perceptual (raiz quadrada) para que um ofensor gigante não achate
 * todas as outras barras — o valor exato fica no número ao lado.
 */
function bar(kb, max, width, colorize) {
  if (max <= 0) return ' '.repeat(width);
  const frac = Math.sqrt(kb / max);
  let units = Math.round(frac * width * 8);
  if (kb > 0 && units < 1) units = 1; // sempre um fiapo visível
  const full = Math.floor(units / 8);
  const rem = units % 8;
  let cells = '█'.repeat(full);
  if (rem > 0 && full < width) cells += EIGHTHS[rem];
  const drawn = full + (rem > 0 && full < width ? 1 : 0);
  const track = COLOR ? ink.faint('·'.repeat(Math.max(0, width - drawn))) : ' '.repeat(Math.max(0, width - drawn));
  return colorize(cells) + track;
}

function truncate(s, max) {
  if (s.length <= max) return s;
  if (max <= 1) return '…';
  return s.slice(0, max - 1) + '…';
}

/**
 * Imprime o relatório de órfãs.
 * @param {Array} orphans - saída de findOrphans()
 * @param {object} opts - { showLow, limit }
 */
export function printReport(orphans, { showLow = false, limit = 40 } = {}) {
  const high = orphans.filter((o) => o.confidence === 'high');
  const low = orphans.filter((o) => o.confidence === 'low');
  const totalHigh = high.reduce((s, o) => s + o.sizeKb, 0);
  const totalLow = low.reduce((s, o) => s + o.sizeKb, 0);

  // --- Cabeçalho / herói -----------------------------------------------------
  console.log();
  console.log(
    `  ${ink.accent('👻 gst')}  ${ink.chrome('·')}  ${ink.chrome('varredura do ~/Library')}`,
  );
  const count = ink.accent(String(high.length));
  const size = bold(ink.accent(fmtSize(totalHigh)));
  console.log(
    `  ${count} ${ink.chrome('pastas fantasma')}  ${ink.chrome('·')}  ${size} ${ink.chrome('para recuperar')}`,
  );
  console.log();

  // --- Grupo principal -------------------------------------------------------
  console.log(`  ${bold('Restos de apps que não estão mais instalados')}`);
  printRows(high, limit);

  // --- Palpites (opcional) ---------------------------------------------------
  if (showLow) {
    console.log();
    console.log(
      `  ${bold('Palpites')} ${ink.chrome('— batem por nome; confira antes de apagar')}`,
    );
    console.log(
      `  ${ink.chrome('inclui caches de ferramentas de dev ainda em uso (JetBrains, Homebrew…)')}`,
    );
    printRows(low, limit);
  }

  // --- Rodapé ----------------------------------------------------------------
  console.log();
  if (high.length) {
    console.log(`  ${bold(ink.accent(fmtSize(totalHigh)))} ${ink.chrome('recuperáveis com segurança')}`);
  }
  if (!showLow && low.length) {
    console.log(
      `  ${ink.chrome('+')} ${ink.chrome(fmtSize(totalLow))} ${ink.chrome(
        `em ${low.length} palpites`,
      )}  ${ink.chrome('·')}  ${ink.chrome('gst scan --all')} ${ink.chrome('para ver')}`,
    );
  }
  console.log();
}

function printRows(items, limit) {
  if (!items.length) {
    console.log(`  ${ink.chrome('nada por aqui. 🎉')}`);
    return;
  }

  const shown = items.slice(0, limit);
  const max = items[0].sizeKb; // já vem ordenado desc
  const cols = process.stdout.columns || 80;

  const sizeW = shown.reduce((w, o) => Math.max(w, fmtSize(o.sizeKb).length), 0);
  const catW = shown.reduce((w, o) => Math.max(w, (CAT_SHORT[o.category] || o.category).length), 0);
  const barW = cols < 92 ? 10 : 18;

  // pad(2) size ' ' bar '  ' name '  ' cat
  const nameW = Math.max(12, cols - 2 - sizeW - 1 - barW - 2 - catW - 2);

  for (const o of shown) {
    const t = tier(o.sizeKb);
    const sizeStr = t(fmtSize(o.sizeKb).padStart(sizeW));
    const barStr = bar(o.sizeKb, max, barW, t);
    const name = truncate(o.confidence === 'high' ? o.key : o.name, nameW).padEnd(nameW);
    const cat = ink.chrome((CAT_SHORT[o.category] || o.category).padStart(catW));
    console.log(`  ${sizeStr} ${barStr}  ${name}  ${cat}`);
  }

  if (items.length > limit) {
    console.log(`  ${ink.chrome(`… e mais ${items.length - limit}`)}  ${ink.chrome('·')}  ${ink.chrome(`gst scan --limit ${items.length}`)}`);
  }
}
