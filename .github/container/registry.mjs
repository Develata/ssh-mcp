import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fullSha, imageTags, REPOSITORY } from './policy.mjs';

const image = 'ghcr.io/develata/ssh-mcp';
const sha = fullSha(process.env.SOURCE_SHA);
const upstream = fullSha(process.env.UPSTREAM_SHA);
const version = process.env.VERSION;
const tags = imageTags(version, sha);
const mode = process.argv[2];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + value + '\n');
function inspect(reference, optional = false) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', reference,
    '--format', '{{json .Manifest}}'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    const error = result.stderr || String(result.error);
    // Authentication, DNS, throttling and registry outages must never mean "absent".
    if (optional && /manifest unknown/i.test(error)) return null;
    if (optional && error.includes(reference) && /:\s*not found\b/i.test(error)) return null;
    throw new Error('Cannot inspect ' + reference + '\n' + error);
  }
  const manifest = JSON.parse(result.stdout);
  assert.match(manifest.digest, /^sha256:[0-9a-f]{64}$/);
  return manifest;
}
if (mode === 'preflight') {
  const existing = tags.map(tag => inspect(image + ':' + tag, true)).filter(Boolean);
  if (existing.some(item => item.digest !== existing[0].digest)) throw new Error('Immutable tags disagree; manual review required');
  output('digest', existing[0]?.digest || '');
  output('build', existing.length ? 'false' : 'true');
  console.log(existing.length ? 'Reusing immutable digest ' + existing[0].digest : 'No immutable tags exist; building a staging image');
} else {
  const digest = process.env.DIGEST;
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  const reference = image + '@' + digest;
  if (mode === 'verify') {
    const manifest = inspect(reference);
    assert.equal(manifest.digest, digest);
    const platforms = manifest.manifests.filter(item => item.platform?.os === 'linux');
    assert.deepEqual(platforms.map(item => item.platform.architecture).sort(), ['amd64', 'arm64']);
    for (const item of platforms) {
      assert.match(item.digest, /^sha256:[0-9a-f]{64}$/);
      const attestation = manifest.manifests.find(entry =>
        entry.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest' &&
        entry.annotations?.['vnd.docker.reference.digest'] === item.digest);
      assert.ok(attestation, 'Attestation is missing for ' + item.platform.architecture);
      assert.match(attestation.digest, /^sha256:[0-9a-f]{64}$/);
      const evidence = JSON.parse(docker('buildx', 'imagetools', 'inspect',
        image + '@' + attestation.digest, '--raw'));
      const predicates = evidence.layers.map(layer => layer.annotations?.['in-toto.io/predicate-type'] || '');
      assert.ok(predicates.some(type => type.startsWith('https://slsa.dev/provenance/')), 'Provenance is missing');
      assert.ok(predicates.includes('https://spdx.dev/Document'), 'SPDX SBOM is missing');
      const platform = 'linux/' + item.platform.architecture;
      const platformImage = image + '@' + item.digest;
      docker('pull', '--platform', platform, platformImage);
      const [local] = JSON.parse(docker('image', 'inspect', platformImage));
      const labels = local.Config.Labels;
      assert.equal(labels['org.opencontainers.image.revision'], sha);
      assert.equal(labels['org.opencontainers.image.version'], tags[0]);
      assert.equal(labels['io.github.develata.ssh-mcp.upstream-revision'], upstream);
      execFileSync(process.execPath, [fileURLToPath(new URL('./smoke.mjs', import.meta.url)),
        platformImage, platform, version], { stdio: 'inherit', timeout: 120000 });
    }
    // Tags are assigned only after pulling and testing the exact staged/reused digest.
    for (const tag of tags) {
      const old = inspect(image + ':' + tag, true);
      if (old && old.digest !== digest) throw new Error('Refusing to overwrite immutable tag ' + tag);
      if (!old) docker('buildx', 'imagetools', 'create', '--tag', image + ':' + tag, reference);
      assert.equal(inspect(image + ':' + tag).digest, digest);
    }
    const record = { image, digest, tags, source: sha, upstream, version,
      platforms: ['linux/amd64', 'linux/arm64'], run: process.env.GITHUB_SERVER_URL + '/' +
      REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID };
    writeFileSync('publication.json', JSON.stringify(record, null, 2) + '\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Verified container candidate\n\n' +
      '- Digest: \x60' + reference + '\x60\n- Tags: ' + tags.join(', ') +
      '\n- Source: https://github.com/' + REPOSITORY + '/commit/' + sha +
      '\n- Upstream: https://github.com/tufantunc/ssh-mcp/commit/' + upstream +
      '\n- Both architectures passed non-root, MIT license, version and MCP smoke checks.\n');
    console.log(JSON.stringify(record, null, 2));
  } else if (mode === 'promote') {
    const remote = execFileSync('git', ['ls-remote', 'https://github.com/' + REPOSITORY + '.git',
      'refs/heads/main'], { encoding: 'utf8' }).split(/\s/)[0];
    assert.equal(remote, sha, 'Main advanced during publication; refusing a stale latest update');
    for (const tag of tags) assert.equal(inspect(image + ':' + tag).digest, digest);
    // This is the final registry mutation. No build/test/upload runs after promotion.
    docker('buildx', 'imagetools', 'create', '--tag', image + ':latest', reference);
    console.log('PROMOTED_LATEST=' + reference);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\nPromoted \x60latest\x60 to the verified digest above.\n');
  } else throw new Error('Unknown registry operation');
}
