/*
 * File: extension/build.mjs
 * Description: Stages the shared DOM engine into the web-extension bundle.
 *   src/core.js is the single DOM engine for this project. The userscript gets it
 *   by concatenation (tools/build.mjs); the extension gets it by this copy into
 *   extension/web/vendor/core.js, which the manifest-free dynamic injection in
 *   background.js loads before content/content.js.
 *
 *   The copy is byte-for-byte and generated, so it is gitignored. Anyone reading
 *   extension/web/vendor/core.js sees a banner telling them not to edit it.
 *   Running this is a precondition for loading the extension.
 * Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * Usage: node extension/build.mjs [--check]
 *   --check exits non-zero if the staged copy is missing or has drifted.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const SOURCE = join(repo, 'src', 'core.js');
const TARGET = join(here, 'web', 'vendor', 'core.js');
const BACKGROUND = join(here, 'web', 'background.js');

/*
 * D-028 / D-024-rationale. The keepalive alarm only survives the worker's hard
 * 30-second teardown when `alarms.create` is evaluated at top level - measured
 * 0/24 and 0/14 teardowns there, against 26/26 and 6/6 when armed 2 ms later
 * from inside the worker (docs/SERVICE-WORKER-LIFETIME.md §4.3). Breaking that
 * produces no error at runtime; sessions just die every 30 seconds.
 *
 * This is checked HERE because running this script is the documented
 * precondition for loading the extension at all, so the invariant cannot be
 * broken and shipped without someone stepping over a hard failure.
 * extension/background.test.mjs proves the same thing behaviourally.
 */
const TOP_LEVEL_ALARM = /^api\.alarms\.create\(KEEPALIVE_ALARM, \{periodInMinutes: 0\.5\}\);$/m;

function assertKeepaliveAtTopLevel() {
  const background = readFileSync(BACKGROUND, 'utf8');
  if (TOP_LEVEL_ALARM.test(background)) return;
  console.error([
    'extension: background.js no longer arms the keepalive alarm at top-level evaluation.',
    '',
    '  Expected this EXACT line at column 0 of extension/web/background.js:',
    '    api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: 0.5});',
    '',
    '  Why this is fatal rather than a style nit: a Safari/WebKit MV3 worker is',
    '  destroyed 30.0s after it starts whatever it is doing, and alarms.create()',
    '  resets that alarm\'s schedule. Armed at top level the alarm fires at 30.000s',
    '  and wins; armed 2ms later it fires at 30.002s, after the worker is gone.',
    '  Measured: 0/24 and 0/14 teardowns vs 26/26 and 6/6.',
    '  See docs/SERVICE-WORKER-LIFETIME.md and docs/DECISIONS.md D-028.'
  ].join('\n'));
  process.exit(1);
}

const BANNER = [
  '/* GENERATED FILE - DO NOT EDIT.',
  ' * Copied verbatim from src/core.js by extension/build.mjs.',
  ' * Edit src/core.js instead, then re-run `node extension/build.mjs`.',
  ' */'
].join('\n');

function stage() {
  const source = readFileSync(SOURCE, 'utf8');
  const sha = createHash('sha256').update(source).digest('hex');
  return {source, sha, output: `${BANNER}\n/* source-sha256: ${sha} */\n${source}`};
}

assertKeepaliveAtTopLevel();

const {sha, output} = stage();
const check = process.argv.includes('--check');

if (check) {
  if (!existsSync(TARGET)) {
    console.error('extension: web/vendor/core.js is missing. Run `node extension/build.mjs`.');
    process.exit(1);
  }
  if (readFileSync(TARGET, 'utf8') !== output) {
    console.error('extension: web/vendor/core.js has drifted from src/core.js. Run `node extension/build.mjs`.');
    process.exit(1);
  }
  console.log(`extension: vendored core.js matches src/core.js (sha256 ${sha.slice(0, 12)}).`);
  console.log('extension: keepalive alarm is armed at top-level evaluation (D-028).');
  process.exit(0);
}

mkdirSync(dirname(TARGET), {recursive: true});
writeFileSync(TARGET, output);
console.log(`extension: staged src/core.js -> extension/web/vendor/core.js (sha256 ${sha.slice(0, 12)}).`);
