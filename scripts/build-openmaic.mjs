import { spawn } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanBuildEnvironment,
  directoryFiles,
  extractSourceArchive,
  filesHash,
  readSourceArchive,
  sha256,
} from './openmaic-build-utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const BUILD_MARKER = '.studyloop-build.json';
const pnpmVersion = '10.28.0';

async function exists(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readJson(filename) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${signal || code}.`)),
    );
  });
}

export async function buildOpenMAIC({ force = false } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 13)
    throw new Error(
      'The bundled classroom build requires Node.js 22.13+ in the Node 22 release line.',
    );
  const vendor = path.join(root, 'vendor/openmaic');
  const manifest = await readJson(path.join(vendor, 'manifest.json'));
  if (!manifest || manifest.archive !== 'source.tar.gz' || !/^[a-f0-9]{40}$/.test(manifest.commit))
    throw new Error('Invalid OpenMAIC source manifest.');
  const archive = await readFile(path.join(vendor, manifest.archive));
  const entries = readSourceArchive(archive, manifest.sha256);
  const overlay = await directoryFiles(path.join(root, 'integrations/openmaic/overlay'));
  if (
    !overlay.some((file) => file.path === 'lib/studyloop/embedded.ts') ||
    !overlay.some((file) => file.path === 'app/studyloop-launch/page.tsx')
  )
    throw new Error('The bundled classroom integration overlay is incomplete.');
  const overlaySha256 = filesHash(overlay);
  const noticesHash = filesHash([
    ...(await directoryFiles(path.join(vendor, 'licenses'))),
    {
      path: 'THIRD_PARTY_NOTICES.md',
      data: await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md')),
    },
  ]);
  const implementationHash = filesHash(
    await Promise.all(
      ['build-openmaic.mjs', 'openmaic-build-utils.mjs'].map(async (name) => ({
        path: name,
        data: await readFile(path.join(root, 'scripts', name)),
      })),
    ),
  );
  const buildHash = sha256(
    JSON.stringify({
      source: manifest.sha256,
      overlay: overlaySha256,
      noticesHash,
      implementationHash,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      pnpmVersion,
    }),
  );
  const parent = path.join(root, '.runtime');
  const runtime = path.join(parent, 'openmaic');
  for (const directory of [parent, runtime]) {
    const info = await exists(directory);
    if (info && !info.isDirectory())
      throw new Error('Classroom runtime directories must not be symlinks or special files.');
  }
  const cached = await readJson(path.join(runtime, BUILD_MARKER));
  if (
    !force &&
    cached?.buildHash === buildHash &&
    (await exists(path.join(runtime, '.next/standalone/server.js'))) &&
    (await exists(path.join(runtime, '.next/standalone/public'))) &&
    (await exists(path.join(runtime, '.next/standalone/.next/static'))) &&
    (await exists(path.join(runtime, 'public')))
  ) {
    console.log(`[classroom] Reusing verified ${manifest.commit.slice(0, 12)} build.`);
    return { cached: true, buildHash, runtime };
  }
  if (await exists(runtime)) {
    if (!(await lstat(runtime)).isDirectory())
      throw new Error('Classroom runtime must be a real directory.');
    for (const name of await readdir(runtime))
      if (name.startsWith('.env') && name !== '.env.example')
        throw new Error(
          'Remove private environment files from .runtime before building; their contents were not read.',
        );
  }
  await mkdir(parent, { recursive: true });
  if (!(await lstat(parent)).isDirectory())
    throw new Error('Runtime parent must be a real directory.');
  const stage = await mkdtemp(path.join(parent, '.openmaic-build-'));
  const moved = [];
  let backup;
  try {
    await extractSourceArchive(entries, stage);
    for (const file of overlay) {
      const target = path.join(stage, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.data);
    }
    // Reuse dependency bytes only. All application source comes from the
    // verified archive and overlay, never from an existing local checkout.
    const packageRoots = entries
      .filter((entry) => !entry.directory && entry.path.endsWith('/package.json'))
      .map((entry) => path.dirname(entry.path));
    for (const relative of [
      'node_modules',
      ...packageRoots.map((directory) => `${directory}/node_modules`),
      '.next/cache',
    ]) {
      const from = path.join(runtime, relative);
      const info = await exists(from);
      if (!info?.isDirectory()) continue;
      const to = path.join(stage, relative);
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
      moved.push({ from, to });
    }
    const env = cleanBuildEnvironment();
    env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || ''}`;
    const sourcePackage = await readJson(path.join(stage, 'package.json'));
    if (!sourcePackage?.packageManager?.startsWith(`pnpm@${pnpmVersion}+`))
      throw new Error('OpenMAIC package-manager pin changed; review the build toolchain.');
    console.log(
      `[classroom] Installing pinned dependencies for ${manifest.commit.slice(0, 12)} with pnpm ${pnpmVersion}.`,
    );
    await run('corepack', ['pnpm', 'install', '--frozen-lockfile'], stage, env);
    const dependencyHash = filesHash(
      await Promise.all(
        ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map(async (filename) => ({
          path: filename,
          data: await readFile(path.join(stage, filename)),
        })),
      ),
    );
    await writeFile(
      path.join(stage, '.studyloop-dependencies.json'),
      JSON.stringify({ dependencyHash, pnpmVersion, node: process.versions.node }, null, 2) + '\n',
    );
    console.log(
      '[classroom] Building the embedded OpenMAIC classroom; the first build can take several minutes.',
    );
    await run('corepack', ['pnpm', 'build'], stage, { ...env, NODE_ENV: 'production' });
    const standalone = path.join(stage, '.next/standalone');
    if (!(await exists(path.join(standalone, 'server.js')))?.isFile())
      throw new Error('Next.js did not produce the expected standalone server.');
    await cp(path.join(stage, 'public'), path.join(standalone, 'public'), { recursive: true });
    await cp(path.join(stage, '.next/static'), path.join(standalone, '.next/static'), {
      recursive: true,
    });
    await cp(path.join(vendor, 'licenses'), path.join(standalone, 'licenses/openmaic'), {
      recursive: true,
    });
    const fontLicense = 'packages/@openmaic/renderer/font-licenses/ZcoolHappy-LICENSE.txt';
    await cp(
      path.join(stage, fontLicense),
      path.join(standalone, 'licenses/openmaic/ZcoolHappy-LICENSE.txt'),
    );
    await cp(
      path.join(root, 'THIRD_PARTY_NOTICES.md'),
      path.join(standalone, 'THIRD_PARTY_NOTICES.md'),
    );
    await writeFile(
      path.join(stage, '.studyloop-source.json'),
      JSON.stringify(
        {
          sourceSha256: manifest.sha256,
          commit: manifest.commit,
          overlaySha256,
          overlayPaths: overlay.map((file) => file.path),
        },
        null,
        2,
      ) + '\n',
    );
    const metadata = {
      buildHash,
      sourceSha256: manifest.sha256,
      overlaySha256,
      commit: manifest.commit,
      node: process.versions.node,
      pnpmVersion,
      builtAt: new Date().toISOString(),
    };
    await writeFile(path.join(stage, BUILD_MARKER), JSON.stringify(metadata, null, 2) + '\n');
    if (await exists(runtime)) {
      backup = `${stage}-previous`;
      await rename(runtime, backup);
    }
    await rename(stage, runtime);
    if (backup)
      await rm(backup, { recursive: true, force: true }).catch(() =>
        console.warn('[classroom] Build succeeded; the previous build cache could not be removed.'),
      );
    console.log(
      `[classroom] Ready: .runtime/openmaic/.next/standalone/server.js (${buildHash.slice(0, 12)}).`,
    );
    return { cached: false, ...metadata, runtime };
  } catch (error) {
    if (backup && !(await exists(runtime))) await rename(backup, runtime);
    for (const item of moved.reverse())
      if ((await exists(item.to)) && !(await exists(item.from))) {
        await mkdir(path.dirname(item.from), { recursive: true });
        await rename(item.to, item.from);
      }
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  buildOpenMAIC({ force: process.argv.includes('--force') }).catch((error) => {
    console.error(`[classroom] ${error.message}`);
    process.exitCode = 1;
  });
