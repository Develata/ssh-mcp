export const UPSTREAM = 'tufantunc/ssh-mcp';
export const REPOSITORY = 'Develata/ssh-mcp';
export const ANCHOR = Date.UTC(2026, 9, 15);
export function scheduledDay(date = new Date()) {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return day >= ANCHOR && ((day - ANCHOR) / 86400000) % 3 === 0;
}
export function stableVersion(tag) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag) || tag.includes('\n')) {
    throw new Error('Expected an upstream stable vMAJOR.MINOR.PATCH release');
  }
  return tag.slice(1);
}
export function fullSha(sha) {
  if (!/^[0-9a-f]{40}$/.test(sha) || sha.includes('\n')) throw new Error('Expected a full commit SHA');
  return sha;
}
export function imageTags(version, sha) {
  stableVersion('v' + version);
  fullSha(sha);
  return [version + '-develata.' + sha, 'sha-' + sha];
}
export function protectedPath(path) {
  return path === '.github' || path.startsWith('.github/') ||
    path === 'docs/develata-container.md';
}
