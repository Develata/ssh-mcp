import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const [image, platform, version] = process.argv.slice(2);
assert.ok(image && /^linux\/(amd64|arm64)$/.test(platform) && version);
const args = ['run', '--rm', '--network', 'none', '--platform', platform,
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges'];
assert.equal(execFileSync('docker', [...args, '--entrypoint', 'id', image, '-u'], { encoding: 'utf8' }).trim(), '65532');
assert.equal(execFileSync('docker', [...args, '--entrypoint', 'cat', image, '/app/LICENSE'], { encoding: 'utf8' }),
  readFileSync('source/LICENSE', 'utf8'));
const name = 'ssh-mcp-smoke-' + process.pid;
const child = spawn('docker', [...args, '--name', name, '-i', image], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', stderr = '', fatal;
const pending = new Map();
function fail(error) {
  fatal = error;
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}
child.on('error', fail);
child.on('exit', (code) => fail(new Error('Container exited before completing the protocol: ' + code + '\n' + stderr)));
child.stderr.on('data', data => { stderr += data; });
child.stdout.on('data', data => {
  buffer += data;
  for (;;) {
    const end = buffer.indexOf('\n');
    if (end < 0) break;
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    try {
      const reply = JSON.parse(line);
      const waiter = pending.get(reply.id);
      if (waiter) { pending.delete(reply.id); waiter.resolve(reply); }
    } catch (error) { fail(error); }
  }
});
const timer = setTimeout(() => fail(new Error('MCP smoke test timed out\n' + stderr)), 60000);
function request(id, method, params) {
  if (fatal) return Promise.reject(fatal);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
try {
  const init = await request(1, 'initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'develata-container-smoke', version: '1' },
  });
  assert.equal(init.result?.serverInfo?.name, 'SSH MCP Server');
  assert.equal(init.result?.serverInfo?.version, version);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listing = await request(2, 'tools/list', {});
  const names = listing.result?.tools?.map(tool => tool.name);
  assert.equal(names?.length, 14, 'Tool inventory changed; review the expected count');
  assert.equal(new Set(names).size, 14);
  assert.ok(names.includes('run-command'));
  const call = await request(3, 'tools/call', { name: 'run-command', arguments: { command: 'echo hi' } });
  assert.equal(call.result?.isError, true);
  assert.match(JSON.stringify(call.result?.content), /No config file found/);
  console.log(platform + ': UID 65532, MIT license, version ' + version + ', MCP handshake, 14 tools and unconfigured refusal passed');
} finally {
  clearTimeout(timer);
  child.stdin.end();
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {}
  child.kill();
}
