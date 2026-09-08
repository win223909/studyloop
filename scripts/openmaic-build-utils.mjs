import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function safeArchivePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    /^[A-Za-z]:/.test(value) ||
    value.startsWith('/')
  )
    throw new Error('Unsafe source archive path.');
  const parts = value.replace(/\/$/, '').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..'))
    throw new Error('Unsafe source archive path.');
  if (
    parts.some((part) => part === '.git' || part === 'node_modules' || part === '.next') ||
    parts.some((part) => part.startsWith('.env') && part !== '.env.example') ||
    parts[0] === 'data'
  )
    throw new Error('Private or generated files are not allowed in the source archive.');
  return parts.join('/');
}

const tarString = (buffer) => buffer.toString('utf8').split('\0')[0];
function octal(buffer) {
  const value = tarString(buffer).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error('Unsupported tar numeric field.');
  const number = Number.parseInt(value || '0', 8);
  if (!Number.isSafeInteger(number)) throw new Error('Invalid tar size.');
  return number;
}

function readPax(buffer) {
  const fields = {};
  let offset = 0;
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset);
    if (space === -1) throw new Error('Invalid tar metadata.');
    const lengthText = buffer.subarray(offset, space).toString('ascii');
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new Error('Invalid tar metadata.');
    const length = Number(lengthText);
    if (
      !Number.isSafeInteger(length) ||
      length <= space - offset + 1 ||
      offset + length > buffer.length
    )
      throw new Error('Invalid tar metadata.');
    const record = buffer.subarray(space + 1, offset + length).toString('utf8');
    if (!record.endsWith('\n') || !record.includes('=')) throw new Error('Invalid tar metadata.');
    const equals = record.indexOf('=');
    const key = record.slice(0, equals);
    if (
      !['path', 'comment', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key)
    )
      throw new Error('Unsupported tar metadata field.');
    fields[key] = record.slice(equals + 1, -1);
    offset += length;
  }
  return fields;
}

// Parse the pinned archive before writing any byte to disk. Links, devices, path
// traversal, duplicate members, invalid checksums and oversized input all fail.
export function readSourceArchive(compressed, expectedHash, { maxBytes = 128 * 1024 * 1024 } = {}) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || sha256(compressed) !== expectedHash)
    throw new Error('OpenMAIC source archive SHA-256 does not match its manifest.');
  const tar = gunzipSync(compressed, { maxOutputLength: maxBytes });
  const entries = [];
  const seen = new Set();
  let offset = 0;
  let globalPax = {};
  let nextPax = {};
  let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (tar.subarray(offset).some((byte) => byte !== 0)) throw new Error('Invalid tar trailer.');
      ended = true;
      break;
    }
    let checksum = 0;
    for (let index = 0; index < 512; index++)
      checksum += index >= 148 && index < 156 ? 32 : header[index];
    if (checksum !== octal(header.subarray(148, 156))) throw new Error('Invalid tar checksum.');
    const size = octal(header.subarray(124, 136));
    const dataOffset = offset + 512;
    if (dataOffset + size > tar.length) throw new Error('Truncated source archive.');
    const data = tar.subarray(dataOffset, dataOffset + size);
    const type = String.fromCharCode(header[156]);
    offset = dataOffset + Math.ceil(size / 512) * 512;
    if (type === 'g' || type === 'x') {
      const fields = readPax(data);
      if (type === 'g') {
        if ('path' in fields) throw new Error('Global tar paths are not supported.');
        globalPax = { ...globalPax, ...fields };
      } else nextPax = fields;
      continue;
    }
    if (!['0', '\0', '5'].includes(type))
      throw new Error('Archive links and special files are not supported.');
    const prefix = tarString(header.subarray(345, 500));
    const name = tarString(header.subarray(0, 100));
    const member = { ...globalPax, ...nextPax };
    nextPax = {};
    const filename = safeArchivePath(member.path || (prefix ? `${prefix}/${name}` : name));
    if (seen.has(filename)) throw new Error('Duplicate source archive member.');
    seen.add(filename);
    const directory = type === '5';
    if (directory && size !== 0) throw new Error('Invalid tar directory.');
    entries.push({
      path: filename,
      directory,
      mode: directory || octal(header.subarray(100, 108)) & 0o111 ? 0o755 : 0o644,
      data,
    });
    if (entries.length > 20000) throw new Error('Too many source archive entries.');
  }
  if (!ended || Object.keys(nextPax).length) throw new Error('Incomplete source archive.');
  return entries;
}

export async function extractSourceArchive(entries, destination) {
  await mkdir(destination, { recursive: true });
  if (!(await lstat(destination)).isDirectory() || (await readdir(destination)).length)
    throw new Error('Source extraction requires an empty real directory.');
  for (const entry of entries) {
    const filename = path.join(destination, safeArchivePath(entry.path));
    if (entry.directory) await mkdir(filename, { recursive: true, mode: 0o755 });
    else {
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o755 });
      await writeFile(filename, entry.data, { mode: entry.mode, flag: 'wx' });
    }
  }
}

export async function directoryFiles(directory, prefix = '') {
  const result = [];
  for (const item of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name, 'en'),
  )) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    safeArchivePath(relative);
    if (item.isSymbolicLink()) throw new Error('Overlay symlinks are not supported.');
    if (item.isDirectory()) result.push(...(await directoryFiles(directory, relative)));
    else if (item.isFile())
      result.push({ path: relative, data: await readFile(path.join(directory, relative)) });
    else throw new Error('Overlay special files are not supported.');
  }
  return result;
}

export function filesHash(files) {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path, 'en')))
    hash.update(file.path).update('\0').update(sha256(file.data)).update('\0');
  return hash.digest('hex');
}

export function cleanBuildEnvironment(env = process.env) {
  const clean = {};
  for (const key of [
    'PATH',
    'HOME',
    'USERPROFILE',
    'SYSTEMROOT',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'XDG_CACHE_HOME',
    'COREPACK_HOME',
    'PNPM_HOME',
    'LANG',
    'LC_ALL',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ])
    if (env[key]) clean[key] = env[key];
  return {
    ...clean,
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_STUDYLOOP_EMBEDDED: 'true',
    NEXT_PUBLIC_PERSISTENCE: '',
    NEXT_PUBLIC_PERSISTENCE_TOKEN: '',
    NEXT_PUBLIC_PRO_WORKBENCH_ENABLED: '',
    OPENMAIC_AGENT_RUNTIME_ENABLED: '',
    NEXT_PUBLIC_ENABLE_VIDEO_EXPORT: '',
    NEXT_PUBLIC_PI_CHAT_ENABLED: '',
  };
}
