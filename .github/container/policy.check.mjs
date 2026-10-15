import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledDay, stableVersion, fullSha, imageTags, protectedPath } from './policy.mjs';

test('three-day UTC cadence crosses month and year boundaries', () => {
  assert.equal(scheduledDay(new Date('2026-10-15T00:00:00Z')), true);
  assert.equal(scheduledDay(new Date('2026-10-16T03:17:00Z')), false);
  assert.equal(scheduledDay(new Date('2026-10-18T23:59:59Z')), true);
  assert.equal(scheduledDay(new Date('2026-10-30T03:17:00Z')), true);
  assert.equal(scheduledDay(new Date('2026-11-01T03:17:00Z')), false);
  assert.equal(scheduledDay(new Date('2026-11-02T03:17:00Z')), true);
  assert.equal(scheduledDay(new Date('2027-01-01T03:17:00Z')), true);
  assert.equal(scheduledDay(new Date('2026-10-14T23:59:59Z')), false);
});
test('stable releases and immutable full-SHA tags only', () => {
  assert.equal(stableVersion('v2.19.1'), '2.19.1');
  for (const value of ['main', 'v2.19.1-rc.1', 'v02.1.0', 'v2.1.0\n', 'v2.1.0;echo x']) {
    assert.throws(() => stableVersion(value));
  }
  assert.throws(() => fullSha('abc123'));
  const sha = 'a'.repeat(40);
  assert.deepEqual(imageTags('2.19.1', sha), ['2.19.1-develata.' + sha, 'sha-' + sha]);
});
test('workflow, automation and fork documentation changes require review', () => {
  for (const path of ['.github/workflows/new.yml', '.github/container/policy.mjs', 'docs/develata-container.md']) {
    assert.equal(protectedPath(path), true);
  }
  for (const path of ['src/index.ts', 'docs/new-upstream-doc.md', 'package-lock.json']) {
    assert.equal(protectedPath(path), false);
  }
});
