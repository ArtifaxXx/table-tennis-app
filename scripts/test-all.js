const { spawnSync } = require('child_process');
const path = require('path');

const steps = [
  {
    name: 'server API tests (jest)',
    command: 'npx',
    args: ['jest'],
    cwd: path.join(__dirname, '..'),
    env: {},
  },
  {
    name: 'client tests (react-scripts)',
    command: 'npm',
    args: ['test', '--', '--watchAll=false'],
    cwd: path.join(__dirname, '../client'),
    env: { CI: 'true' },
  },
];

let failed = false;
for (const step of steps) {
  console.log(`\n=== ${step.name} ===\n`);
  const res = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...step.env },
  });
  if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
