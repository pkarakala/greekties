// Shared by the disposable-local account-deletion integration scripts.
function createRunner({ required, report, save, only = process.env.ONLY }) {
  const diagnostic = process.env.QA_DIAGNOSTIC === '1';
  if (only && !diagnostic)
    throw new Error('ONLY requires QA_DIAGNOSTIC=1; focused runs are not full coverage');
  const selected = only ? only.split(',').filter(Boolean) : [...required];
  if (
    !selected.length ||
    selected.some((id) => !required.includes(id)) ||
    new Set(selected).size !== selected.length
  )
    throw new Error('Unknown, empty or duplicate selected checks');
  report.run = {
    scope: diagnostic ? 'FOCUSED DIAGNOSTIC' : 'FULL REQUIRED MATRIX',
    required,
    selected,
    completed: false,
    missing: [...selected],
  };
  let finished = false;
  const persist = () => {
    try {
      save();
    } catch {
      process.exitCode = 1;
    }
  };
  function validate() {
    const counts = new Map();
    for (const c of report.checks) counts.set(c.id, (counts.get(c.id) || 0) + 1);
    report.run.missing = selected.filter((id) => !counts.has(id));
    report.run.invalid = report.checks
      .filter((c) => !selected.includes(c.id) || counts.get(c.id) !== 1 || c.status !== 'PASS')
      .map((c) => c.id);
    if (!finished || report.run.missing.length || report.run.invalid.length || report.fatal)
      process.exitCode = 1;
    persist();
  }
  const onExit = () => {
    if (!finished) {
      report.run.completed = false;
      process.exitCode = process.exitCode || 1;
    }
    validate();
  };
  process.once('beforeExit', onExit);
  process.once('exit', onExit);
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])
    process.once(signal, () => {
      report.fatal = `Interrupted: ${signal}`;
      report.run.completed = false;
      persist();
      process.exit(code);
    });
  return {
    async check(id, fn) {
      if (!selected.includes(id)) return;
      const check = { id, status: 'NOT RUN' };
      report.checks.push(check);
      persist();
      try {
        if (process.env.QA_FORCE_FAIL_CHECK === id)
          throw new Error('QA intentional harness failure');
        check.evidence = await fn();
        check.status = 'PASS';
      } catch (e) {
        check.status = 'FAIL';
        check.error = e?.message || String(e);
        process.exitCode = 1;
      }
      persist();
      console.log(report.run.scope, check.status, id);
    },
    finish() {
      finished = true;
      report.run.completed = true;
      validate();
    },
    fatal(error) {
      report.fatal = error?.message || String(error);
      report.run.completed = false;
      process.exitCode = 1;
      persist();
    },
  };
}
module.exports = { createRunner };
