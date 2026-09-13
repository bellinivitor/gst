#!/usr/bin/env node
import { findOrphans } from '../src/diff.js';
import { printReport } from '../src/report.js';

const HELP = `gst — encontra pastas órfãs deixadas por apps desinstalados no macOS

Uso:
  gst scan [opções]      Lista pastas órfãs no ~/Library, ordenadas por tamanho
  gst help               Mostra esta ajuda

Opções do scan:
  --all            Inclui também órfãs de confiança baixa (nome de app)
  --system         Inclui bundle ids do sistema (com.apple.*)
  --limit N        Máximo de linhas por grupo (padrão: 40)
  --json           Saída em JSON (para scripts)
`;

function parseArgs(argv) {
  const opts = { all: false, system: false, json: false, limit: 40 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--system') opts.system = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 40;
    else {
      console.error(`Opção desconhecida: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

async function cmdScan(argv) {
  const opts = parseArgs(argv);
  if (!opts.json && process.stderr.isTTY) process.stderr.write('Varrendo…\r');
  const orphans = await findOrphans({ includeSystem: opts.system });
  if (!opts.json && process.stderr.isTTY) process.stderr.write('        \r');

  if (opts.json) {
    const out = opts.all ? orphans : orphans.filter((o) => o.confidence === 'high');
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log();
  printReport(orphans, { showLow: opts.all, limit: opts.limit });
  console.log();
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'scan':
      await cmdScan(rest);
      break;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`Comando desconhecido: ${cmd}\n`);
      console.log(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
