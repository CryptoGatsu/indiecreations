// Server-side only: replays a submitted heat run through DeathRace3000's deterministic simulation. bin/drverify is the
// self-contained linux-x64 verifier built from the same C# the game runs (DeathRace3000 tools/DeathRace.Verifier); a
// run's score only counts if the replay reproduces it.
import { execFile } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'lib/deathrace/bin/drverify');
const EXE = '/tmp/drverify';

function exe() {
  if (process.platform !== 'linux') throw new Error('the run verifier only runs on the Linux server');
  if (!existsSync(EXE)) { copyFileSync(SRC, EXE); chmodSync(EXE, 0o755); }
  return EXE;
}

/** logs: base64 InputLogs, the player's first. Resolves { ok, seed, scoreRaw, ticks, end, checkpoints, hash, ... }. */
export function verifyRun(logs) {
  return new Promise((done) => {
    let path;
    try { path = exe(); } catch (e) { return done({ ok: false, error: e.message }); }
    const child = execFile(path, [], {
      timeout: 45_000, maxBuffer: 1 << 20,
      env: { ...process.env, DOTNET_BUNDLE_EXTRACT_BASE_DIR: '/tmp', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
    }, (err, stdout, stderr) => {
      const line = String(stdout || '').trim().split(/\r?\n/).pop() || '';
      try { done(JSON.parse(line)); } catch {
        done({ ok: false, error: err ? (String(stderr || '').trim().split('\n').pop() || err.message) : 'verifier gave no result' });
      }
    });
    child.stdin.end(JSON.stringify({ logs }));
  });
}
