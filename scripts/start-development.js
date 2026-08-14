const { spawnSync } = require('node:child_process');

const expoCli = require.resolve('expo/bin/cli');
const result = spawnSync(
  process.execPath,
  [expoCli, 'start', '--dev-client', ...process.argv.slice(2)],
  {
    env: { ...process.env, APP_VARIANT: 'development' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
