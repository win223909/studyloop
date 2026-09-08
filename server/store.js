import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const valid = /^[a-zA-Z0-9_-]{1,100}$/;
async function atomicWrite(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600 });
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export class StoreDeleteError extends Error {
  constructor(restoreFailed) {
    super(
      restoreFailed
        ? 'Record deletion failed and recovery was incomplete.'
        : 'Record deletion failed; removed records were restored.',
    );
    this.name = 'StoreDeleteError';
    this.restoreFailed = restoreFailed;
  }
}

export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.queue = Promise.resolve();
  }
  file(collection, id) {
    if (!valid.test(collection) || !valid.test(id)) throw new Error('Invalid storage identifier.');
    return path.join(this.directory, collection, `${id}.json`);
  }
  async get(collection, id) {
    const filename = this.file(collection, id);
    try {
      return JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  async put(collection, id, value) {
    const filename = this.file(collection, id);
    await atomicWrite(filename, JSON.stringify(value));
    return value;
  }
  async remove(collection, id) {
    await unlink(this.file(collection, id));
  }
  // Call inside transaction with related writers using the same lock. Pre-read
  // exact bytes before removing anything, then restore on an ordinary I/O failure.
  // This is not a crash-atomic filesystem transaction; recovery can itself fail.
  async deleteMany(entries, { records = [] } = {}) {
    const unique = [
      ...new Map(
        entries.map(({ collection, id }) => [this.file(collection, id), { collection, id }]),
      ).values(),
    ];
    const deleting = new Set(unique.map(({ collection, id }) => this.file(collection, id)));
    const writing = new Set();
    for (const { collection, id } of records) {
      const filename = this.file(collection, id);
      if (deleting.has(filename) || writing.has(filename))
        throw new Error('Conflicting storage batch.');
      writing.add(filename);
    }
    const backups = await Promise.all(
      unique.map(async (entry) => ({
        ...entry,
        contents: await readFile(this.file(entry.collection, entry.id)),
      })),
    );
    const recordBackups = await Promise.all(
      records.map(async (entry) => {
        let contents = null;
        try {
          contents = await readFile(this.file(entry.collection, entry.id));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        return { ...entry, contents };
      }),
    );
    const removed = [];
    const attemptedWrites = [];
    try {
      for (const entry of backups) {
        await this.remove(entry.collection, entry.id);
        removed.push(entry);
      }
      for (const entry of recordBackups) {
        attemptedWrites.push(entry);
        await this.put(entry.collection, entry.id, entry.value);
      }
    } catch {
      const restored = await Promise.allSettled([
        ...removed.map((entry) =>
          atomicWrite(this.file(entry.collection, entry.id), entry.contents),
        ),
        ...attemptedWrites.map(async (entry) => {
          const filename = this.file(entry.collection, entry.id);
          if (entry.contents !== null) return atomicWrite(filename, entry.contents);
          await unlink(filename).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }),
      ]);
      throw new StoreDeleteError(restored.some((result) => result.status === 'rejected'));
    }
    return unique;
  }
  async list(collection) {
    if (!valid.test(collection)) throw new Error('Invalid storage collection.');
    let files;
    try {
      files = await readdir(path.join(this.directory, collection));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return (
      await Promise.all(
        files
          .filter((name) => name.endsWith('.json'))
          .map((name) => this.get(collection, name.slice(0, -5))),
      )
    ).filter(Boolean);
  }
  // Serialize local updates (one app process per data volume).
  transaction(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
}
