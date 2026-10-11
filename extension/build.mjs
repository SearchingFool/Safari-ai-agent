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
  process.exit(0);
}

mkdirSync(dirname(TARGET), {recursive: true});
writeFileSync(TARGET, output);
console.log(`extension: staged src/core.js -> extension/web/vendor/core.js (sha256 ${sha.slice(0, 12)}).`);
