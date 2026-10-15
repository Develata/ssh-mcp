import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fullSha, imageTags, protectedPath, REPOSITORY, stableVersion, UPSTREAM } from './policy.mjs';

const git = (...args) => execFileSync('git', args, { cwd: 'source', encoding: 'utf8' }).trim();
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + value + '\n');
const base = fullSha(git('rev-parse', 'HEAD'));
const isPR = process.env.GITHUB_EVENT_NAME === 'pull_request';
const publish = !isPR && process.env.GITHUB_REF === 'refs/heads/main' &&
  process.env.GITHUB_REPOSITORY === REPOSITORY &&
  (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.PUBLISH === 'true');
let upstream = base;
let version = JSON.parse(readFileSync('source/package.json', 'utf8')).version;

git('switch', '-C', 'candidate');
if (!isPR) {
  const response = await fetch('https://api.github.com/repos/' + UPSTREAM + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'develata-container-sync' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Upstream release lookup failed: HTTP ' + response.status);
  const release = await response.json();
  if (release.draft || release.prerelease) throw new Error('Release must be stable and published');
  const releaseVersion = stableVersion(release.tag_name);
  git('fetch', '--no-tags', 'https://github.com/' + UPSTREAM + '.git',
    'refs/tags/' + release.tag_name + ':refs/tags/container-upstream');
  upstream = fullSha(git('rev-parse', 'refs/tags/container-upstream^{commit}'));
  const upstreamPackage = JSON.parse(git('show', upstream + ':package.json'));
  if (upstreamPackage.version !== releaseVersion) throw new Error('Release tag/package version mismatch');

  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  try {
    git('merge', '--no-ff', '--no-commit', upstream);
    const changed = git('diff', '--name-only', '-z', base).split('\0').filter(Boolean);
    const guarded = changed.filter(protectedPath);
    if (guarded.length) throw new Error('Review required for protected changes: ' + guarded.join(', '));
    git('diff', '--exit-code', base, '--', '.github', 'docs/develata-container.md');
    let mergePending = false;
    try { git('rev-parse', '--verify', 'MERGE_HEAD'); mergePending = true; } catch {}
    if (mergePending) git('commit', '-m', 'Merge upstream ' + release.tag_name + ' for verified container publication');
  } catch (error) {
    try { git('merge', '--abort'); } catch {}
    throw error;
  }
  version = JSON.parse(readFileSync('source/package.json', 'utf8')).version;
  if (version !== releaseVersion) throw new Error('Fork version differs from latest stable release; review required');
  git('merge-base', '--is-ancestor', upstream, 'HEAD');
}
stableVersion('v' + version);
const sha = fullSha(git('rev-parse', 'HEAD'));
const [versionTag, shaTag] = imageTags(version, sha);
if (git('status', '--porcelain')) throw new Error('Candidate is not clean');
git('bundle', 'create', '../candidate.bundle', 'candidate');
const metadata = { base, sha, upstream, version, versionTag, shaTag, publish };
writeFileSync('candidate.json', JSON.stringify(metadata, null, 2) + '\n');
for (const [key, value] of Object.entries(metadata)) output(key, String(value));
console.log(JSON.stringify(metadata, null, 2));
