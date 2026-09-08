import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MEDIA_PREFIXES = [
  'IMAGE_OPENAI',
  'IMAGE_SEEDREAM',
  'IMAGE_QWEN_IMAGE',
  'IMAGE_NANO_BANANA',
  'IMAGE_MINIMAX',
  'IMAGE_GROK',
  'IMAGE_LEMONADE',
  'IMAGE_COMFYUI',
  'VIDEO_SEEDANCE',
  'VIDEO_KLING',
  'VIDEO_VEO',
  'VIDEO_MINIMAX',
  'VIDEO_GROK',
  'VIDEO_HAPPYHORSE',
];

// Build a fresh environment. Unrelated credentials in the parent shell and the
// user's independent OpenMAIC installation must never configure this runtime.
export function openMAICEnvironment(env, { port, token, systemEnv = process.env }) {
  const result = {};
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SystemRoot'])
    if (systemEnv[name]) result[name] = systemEnv[name];
  Object.assign(result, {
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_STUDYLOOP_EMBEDDED: 'true',
    STUDYLOOP_RUNTIME_TOKEN: token,
    OPENAI_COMPAT_USE_STREAMING_CHAT: 'true',
    STUDYLOOP_LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || '90000',
    STUDYLOOP_LLM_MAX_OUTPUT_TOKENS: env.LLM_MAX_OUTPUT_TOKENS || '8192',
  });
  for (const prefix of MEDIA_PREFIXES) result[`${prefix}_ENABLED`] = 'false';
  const protocol =
    env.LLM_PROVIDER === 'openai' ? 'openai-compatible' : env.LLM_PROVIDER || 'openai-compatible';
  const key = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  const keyless = protocol === 'openai-compatible' && !key && env.LLM_ALLOW_KEYLESS === 'true';
  const provider = keyless
    ? 'OLLAMA'
    : { 'openai-compatible': 'OPENAI', anthropic: 'ANTHROPIC', gemini: 'GOOGLE' }[protocol];
  if (provider && model && (key || keyless)) {
    const defaults = {
      OPENAI: 'https://api.openai.com/v1',
      ANTHROPIC: 'https://api.anthropic.com/v1',
      GOOGLE: 'https://generativelanguage.googleapis.com/v1beta',
      OLLAMA: 'http://localhost:11434/v1',
    };
    if (key) result[`${provider}_API_KEY`] = key;
    result[`${provider}_BASE_URL`] = env.LLM_BASE_URL?.trim() || defaults[provider];
    result[`${provider}_MODELS`] = model;
    result.DEFAULT_MODEL = `${provider.toLowerCase()}:${model}`;
  }
  return result;
}

async function vacantPort() {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

/** One owned child process per StudyLoop server, started on the first classroom visit. */
export function createOpenMAICRuntime({ root, env = process.env, startupTimeout = 60000 }) {
  const entry = path.join(root, '.runtime/openmaic/.next/standalone/server.js');
  let child;
  let connection;
  let state = 'stopped';
  let starting;
  let epoch = 0;
  let stopping;
  const installed = () => existsSync(entry);

  async function stop() {
    if (stopping) return stopping;
    epoch++;
    starting = undefined;
    connection = undefined;
    state = 'stopped';
    const owned = child;
    child = undefined;
    stopping = (async () => {
      if (owned && owned.exitCode === null && owned.signalCode === null) {
        const exited = new Promise((resolve) => owned.once('exit', resolve));
        owned.kill('SIGTERM');
        await Promise.race([exited, delay(5000, undefined, { ref: false })]);
        if (owned.exitCode === null && owned.signalCode === null) {
          owned.kill('SIGKILL');
          await exited;
        }
      }
    })();
    try {
      await stopping;
    } finally {
      stopping = undefined;
    }
  }

  async function ensureRunning() {
    if (stopping) await stopping;
    if (connection && child?.exitCode === null && child?.signalCode === null) return connection;
    if (starting) return starting;
    if (!installed())
      throw new Error('The built-in classroom is not installed. Run npm run classroom:install.');
    const generation = epoch;
    const pending = (async () => {
      state = 'starting';
      const port = await vacantPort();
      if (generation !== epoch) throw new Error('Classroom startup was cancelled.');
      const token = randomBytes(32).toString('hex');
      const address = { url: `http://127.0.0.1:${port}`, token };
      const owned = spawn(process.execPath, [entry], {
        cwd: path.dirname(entry),
        env: openMAICEnvironment(env, { port, token }),
        // Upstream errors can include request bodies or provider credentials.
        // Public errors come from the front-door proxy, never raw child output.
        stdio: 'ignore',
      });
      child = owned;
      let failed = false;
      owned.once('error', () => {
        failed = true;
      });
      owned.once('exit', () => {
        if (child === owned) {
          child = undefined;
          connection = undefined;
          state = 'failed';
        }
      });
      const deadline = Date.now() + startupTimeout;
      while (Date.now() < deadline && generation === epoch) {
        if (failed || owned.exitCode !== null || owned.signalCode !== null) break;
        try {
          const response = await fetch(`${address.url}/api/health`, {
            headers: { 'x-studyloop-runtime': token },
            signal: AbortSignal.timeout(2000),
          });
          const health = response.ok ? await response.json() : null;
          if (health?.success === true && health?.status === 'ok' && generation === epoch) {
            state = 'ready';
            connection = address;
            return address;
          }
        } catch {
          /* Keep polling during the bounded startup window. */
        }
        await delay(200);
      }
      if (generation === epoch) {
        await stop();
        state = 'failed';
      }
      throw new Error(
        'The built-in classroom could not start. Rebuild it with npm run classroom:install.',
      );
    })();
    starting = pending;
    try {
      return await pending;
    } finally {
      if (starting === pending) starting = undefined;
    }
  }

  return {
    status: () => ({
      installed: installed(),
      ready: state === 'ready',
      state: installed() ? state : 'not-installed',
      version: '1.0.0',
    }),
    ensureRunning,
    refresh: async () => {
      const wasRunning = Boolean(child || starting);
      const pending = starting;
      await stop();
      if (pending) await pending.catch(() => {});
      if (wasRunning) await ensureRunning();
    },
    stop,
  };
}
