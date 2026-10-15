import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
for (const file of ['Dockerfile', 'LICENSE', '.dockerignore']) {
  if (!lstatSync('source/' + file).isFile()) throw new Error(file + ' must be a regular file');
}
const path = 'source/Dockerfile';
const original = readFileSync(path, 'utf8');
const anchor = 'COPY config.default.toml ./config.default.toml\n';
if (original.split(anchor).length !== 2) throw new Error('Upstream Dockerfile changed; review the license-copy step');
if (!readFileSync('source/LICENSE', 'utf8').includes('MIT License')) throw new Error('Expected upstream MIT license');
if (original.includes('COPY LICENSE ./LICENSE')) throw new Error('License packaging changed; review before publishing');
writeFileSync(path, original.replace(anchor, anchor + 'COPY LICENSE ./LICENSE\n'));
