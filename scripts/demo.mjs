#!/usr/bin/env node
/**
 * `pnpm demo` — the whole stack, from a clean clone, in one command.
 *
 * It loads `.env` (writing it from `.env.example` the first time), refuses to
 * start when a required variable is missing or too short, brings the
 * infrastructure up and waits for its healthchecks, then hands over to
 * `turbo run dev`, which runs the two APIs, the workers and the two Vue apps.
 *
 * Plain Node, no dependencies: this is the first command a new clone runs, and
 * it has to work before anything is installed beyond `pnpm install`.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(repoRoot, '.env');
const envExamplePath = resolve(repoRoot, '.env.example');

const bold = (text) => `\u001b[1m${text}\u001b[0m`;
const dim = (text) => `\u001b[2m${text}\u001b[0m`;
const red = (text) => `\u001b[31m${text}\u001b[0m`;
const green = (text) => `\u001b[32m${text}\u001b[0m`;

function fail(message, hint) {
  console.error(`\n${red('✖')} ${bold(message)}`);
  if (hint !== undefined) {
    console.error(`\n${hint}\n`);
  }
  process.exit(1);
}

// ── Environment ────────────────────────────────────────────────────────────

/**
 * Required by `loadConfig` in the two APIs, with the minimum length each one
 * enforces. Duplicated here on purpose: the point of this check is to fail
 * before five processes start and three of them die with the same message.
 */
const REQUIRED = [
  {
    name: 'JWT_SECRET',
    minLength: 32,
    used: '@penka/api — signs player access and refresh tokens',
  },
  {
    name: 'ADMIN_API_KEY',
    minLength: 32,
    used: '@penka/backoffice-api — the x-admin-key every admin route checks',
  },
];

function parseEnvFile(path) {
  const values = new Map();
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key !== '') {
      values.set(key, value);
    }
  }
  return values;
}

function loadEnv() {
  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      fail('No .env and no .env.example', 'This clone is incomplete — .env.example is tracked.');
    }
    copyFileSync(envExamplePath, envPath);
    console.log(`${green('✔')} wrote .env from .env.example`);
    console.log(
      dim('  These are dev-only values for a localhost stack. Generate real ones per\n') +
        dim('  environment before deploying anything.'),
    );
  }

  // An exported variable wins over the file: the file is the default, not the law.
  for (const [key, value] of parseEnvFile(envPath)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  const problems = [];
  for (const { name, minLength, used } of REQUIRED) {
    const value = process.env[name];
    if (value === undefined || value === '') {
      problems.push(`${bold(name)} is not set — ${used}`);
    } else if (value.length < minLength) {
      problems.push(
        `${bold(name)} is ${value.length} characters, minimum ${minLength} — ${used}`,
      );
    }
  }
  if (problems.length > 0) {
    fail(
      `Cannot start: ${problems.length} environment problem${problems.length === 1 ? '' : 's'}`,
      `${problems.map((problem) => `  - ${problem}`).join('\n')}\n\n` +
        `Fix them in ${dim(envPath)} (or export them) and run ${bold('pnpm demo')} again.\n` +
        `${dim('.env.example lists every variable the stack reads.')}`,
    );
  }
}

// ── Processes ──────────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.quiet === true ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
      shell: false,
    });
    let output = '';
    child.stdout?.on('data', (chunk) => (output += String(chunk)));
    child.stderr?.on('data', (chunk) => (output += String(chunk)));
    child.on('error', (error) => resolvePromise({ code: 1, output: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output }));
  });
}

async function startInfra() {
  console.log(`\n${bold('▸ infrastructure')} ${dim('(mongo, redis, rabbitmq)')}`);
  const docker = await run('docker', ['compose', 'version'], { quiet: true });
  if (docker.code !== 0) {
    fail(
      'Docker Compose is not available',
      'The stack needs MongoDB, Redis and RabbitMQ. Install Docker Desktop (or the\n' +
        'docker engine with the compose plugin), start it, and run `pnpm demo` again.',
    );
  }
  // `--wait` blocks until every healthcheck in the compose file passes, so
  // nothing downstream has to poll for a database that is still starting.
  const up = await run('docker', [
    'compose',
    '-f',
    'infra/docker-compose.yml',
    'up',
    '-d',
    '--wait',
  ]);
  if (up.code !== 0) {
    fail(
      'Could not start the infrastructure containers',
      'Check the docker output above. If the ports are taken, `pnpm infra:down` in the\n' +
        'other clone, or stop whatever is on 27017 / 6379 / 5672.',
    );
  }
  console.log(`${green('✔')} mongo, redis and rabbitmq are healthy`);
}

const SERVICES = [
  { name: '@penka/api', url: 'http://localhost:3000', probe: 'http://localhost:3000/health' },
  {
    name: '@penka/backoffice-api',
    url: 'http://localhost:3001',
    probe: 'http://localhost:3001/health',
  },
  { name: '@penka/web', url: 'http://localhost:5173', probe: 'http://localhost:5173' },
  {
    name: '@penka/backoffice-web',
    url: 'http://localhost:5174',
    probe: 'http://localhost:5174',
  },
];

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Watch the apps come up and print the URL map once they have. Runs alongside
 * turbo rather than gating it — turbo's own output is the log, and this is the
 * summary an operator actually wants at the top of it.
 */
async function announceWhenReady() {
  const deadline = Date.now() + 120_000;
  let pending = [...SERVICES];
  while (Date.now() < deadline && pending.length > 0) {
    const reachable = await Promise.all(pending.map((service) => isUp(service.probe)));
    pending = pending.filter((_, index) => reachable[index] !== true);
    if (pending.length > 0) {
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }

  const rows = [
    ...SERVICES.map((service) => [service.name, service.url]),
    ['@penka/workers', dim('no port — consumes matchday.resolution')],
    ['RabbitMQ management', 'http://localhost:15672 (guest / guest)'],
    ['MongoDB', 'mongodb://127.0.0.1:27017/penka'],
    ['Redis', 'redis://127.0.0.1:6379'],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));

  console.log(`\n${bold('▸ stack')}`);
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(width)}  ${value}`);
  }
  if (pending.length > 0) {
    console.log(
      `\n${red('!')} still waiting on ${pending.map((service) => service.name).join(', ')} — ` +
        'see the turbo output above.',
    );
  }
  console.log(
    `\n  ${dim('Player app → register, create a penka, share the 4-digit code.')}\n` +
      `  ${dim('Back office → paste ADMIN_API_KEY, close a matchday, load results, resolve.')}\n` +
      `  ${dim('End-to-end suite → `pnpm e2e` in another terminal (it resets the game data).')}\n`,
  );
}

async function main() {
  loadEnv();
  await startInfra();

  console.log(`\n${bold('▸ apps')} ${dim('(turbo run dev — ctrl-c stops everything)')}`);
  const turbo = spawn('pnpm', ['exec', 'turbo', 'run', 'dev'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  void announceWhenReady();

  const stop = (signal) => () => {
    turbo.kill(signal);
  };
  process.on('SIGINT', stop('SIGINT'));
  process.on('SIGTERM', stop('SIGTERM'));

  turbo.on('close', (code) => {
    // The containers deliberately outlive the apps: `pnpm demo` again is fast,
    // and `pnpm infra:down` is the one command that throws the data away.
    console.log(`\n${dim('apps stopped. Containers are still up — `pnpm infra:down` stops them.')}`);
    process.exit(code ?? 0);
  });
}

await main();
