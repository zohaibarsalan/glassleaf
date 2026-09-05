import * as SQLite from 'expo-sqlite';
import { LibraryRepository, type SQL } from '@glassleaf/library';
import { randomUUID } from 'expo-crypto';
let opening: Promise<LibraryRepository> | undefined;
export function openLibrary() {
  return opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync('glassleaf.sqlite');
    let writes: Promise<unknown> = Promise.resolve();
    const raw: SQL = {
      exec: text => db.execAsync(text),
      async run(text, ...params) { await db.runAsync(text, params); },
      all: (text, ...params) => db.getAllAsync(text, params),
      transaction: action => {
        const job = writes.then(async () => {
          await db.execAsync('BEGIN IMMEDIATE');
          try { const value = await action(raw); await db.execAsync('COMMIT'); return value; }
          catch (error) { await db.execAsync('ROLLBACK'); throw error; }
        });
        writes = job.catch(() => undefined);
        return job;
      },
    };
    // Root writes join the same queue; transactional writes use the raw connection.
    const sql: SQL = { ...raw, run: (text, ...params) => raw.transaction(tx => tx.run(text, ...params)) };
    const seed = new LibraryRepository(sql, 'initializing'); await seed.initialize();
    let device = await seed.setting('device');
    if (!device) { device = randomUUID(); await seed.setSetting('device', device); }
    return new LibraryRepository(sql, device);
  })();
}
