import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';
const helper = path.resolve(__dirname, '../../scripts/qa/account-deletion-runner.cjs');
function run(code: string, extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const name of ['ONLY', 'QA_DIAGNOSTIC', 'QA_FORCE_FAIL_CHECK']) delete env[name];
  return spawnSync(
    process.execPath,
    [
      '-e',
      `const {createRunner}=require(${JSON.stringify(helper)});const report={checks:[]};const r=createRunner({required:['a','b'],report,save:()=>{}});(async()=>{${code}})();process.on('exit',()=>console.log(JSON.stringify(report)));`,
    ],
    { encoding: 'utf8', env: { ...env, ...extra } },
  );
}
describe('account deletion QA runner exits', () => {
  it('passes only a complete required matrix', () => {
    const result = run("await r.check('a',async()=>1);await r.check('b',async()=>2);r.finish();");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FULL REQUIRED MATRIX');
  });
  it('exits nonzero on an intentionally failed assertion', () => {
    const result = run(
      "await r.check('a',async()=>{throw Error('intentional')});await r.check('b',async()=>2);r.finish();",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"status":"FAIL"');
  });
  it('rejects missing checks even after finish', () => {
    const result = run("await r.check('a',async()=>1);r.finish();");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"missing":["b"]');
  });
  it('rejects an incomplete run even if every attempted check passes', () => {
    const result = run("await r.check('a',async()=>1);await r.check('b',async()=>2);");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"completed":false');
  });
  it('requires explicit diagnostic labeling for a focused run', () => {
    expect(run("await r.check('a',async()=>1);r.finish();", { ONLY: 'a' }).status).not.toBe(0);
    const result = run("await r.check('a',async()=>1);r.finish();", {
      ONLY: 'a',
      QA_DIAGNOSTIC: '1',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FOCUSED DIAGNOSTIC');
    expect(result.stdout).toContain('"required":["a","b"]');
  });
  it('rejects duplicate checks and required checks left pending', () => {
    expect(
      run(
        "await r.check('a',async()=>1);await r.check('a',async()=>1);await r.check('b',async()=>1);r.finish();",
      ).status,
    ).toBe(1);
    expect(
      run("report.checks.push({id:'a',status:'NOT RUN'},{id:'b',status:'PASS'});r.finish();")
        .status,
    ).toBe(1);
  });
});
