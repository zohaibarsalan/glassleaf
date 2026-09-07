import { LibraryRepository, type SQL } from "@glassleaf/library";
import { randomUUID } from "expo-crypto";
import {
  sqlite3Worker1Promiser,
  type Worker1Promiser,
} from "@sqlite.org/sqlite-wasm";

let opening: Promise<LibraryRepository> | undefined;
let releaseLibraryLock: (() => void) | undefined;
let activeDatabase: Worker1Promiser | undefined;
let activeWorker: Worker | undefined;

async function claimLibraryTab() {
  if (!navigator.locks) return;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void navigator.locks
    .request(
      "glassleaf-browser-library",
      { ifAvailable: true, mode: "exclusive" },
      (lock) => {
        if (!lock) {
          rejectReady?.(
            new Error(
              "Glassleaf is already open in another tab. Close that tab, then reload this page.",
            ),
          );
          return;
        }
        resolveReady?.();
        return new Promise<void>((resolve) => {
          releaseLibraryLock = resolve;
        });
      },
    )
    .catch((error: unknown) => {
      rejectReady?.(
        error instanceof Error
          ? error
          : new Error("Could not claim the browser library lock."),
      );
    });
  await ready;
}

async function openDatabase() {
  // The package's ESM export is already the promise-returning Worker1 factory.
  const worker = new Worker("/glassleaf-sqlite-worker.mjs?opfs-disable=1", {
    type: "module",
  });
  try {
    const promiser = await sqlite3Worker1Promiser({ worker });
    await promiser("open", {
      // SAH pool storage needs neither SharedArrayBuffer nor COOP/COEP headers.
      // It deliberately uses one active library connection per origin.
      filename: "file:/glassleaf.sqlite3?vfs=opfs-sahpool",
    });
    activeDatabase = promiser;
    activeWorker = worker;
    return promiser;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

async function releaseLibraryTab() {
  try {
    await activeDatabase?.("close", {});
  } catch {
    // The worker will be terminated even if an incomplete open cannot close.
  }
  activeDatabase = undefined;
  activeWorker?.terminate();
  activeWorker = undefined;
  releaseLibraryLock?.();
  releaseLibraryLock = undefined;
}

async function execute(
  database: Worker1Promiser,
  sql: string,
  params: (string | number | null)[] = [],
) {
  await database("exec", { sql, bind: params });
}

async function select<T>(
  database: Worker1Promiser,
  sql: string,
  params: (string | number | null)[],
) {
  const rows: T[] = [];
  await database("exec", {
    sql,
    bind: params,
    rowMode: "object",
    callback: (message) => {
      if (message.row) rows.push(message.row as T);
    },
  });
  return rows;
}

export function openLibrary() {
  if (opening) return opening;
  opening = (async () => {
    await claimLibraryTab();
    const database = await openDatabase();
    let writes: Promise<unknown> = Promise.resolve();
    const raw: SQL = {
      exec: (sql) => execute(database, sql),
      run: (sql, ...params) => execute(database, sql, params),
      all: (sql, ...params) => select(database, sql, params),
      transaction: (action) => {
        const job = writes.then(async () => {
          await execute(database, "BEGIN IMMEDIATE");
          try {
            const value = await action(raw);
            await execute(database, "COMMIT");
            return value;
          } catch (error) {
            await execute(database, "ROLLBACK");
            throw error;
          }
        });
        writes = job.catch(() => undefined);
        return job;
      },
    };
    const sql: SQL = {
      ...raw,
      run: (statement, ...params) =>
        raw.transaction((tx) => tx.run(statement, ...params)),
      // A repository read outside a transaction observes a completed write.
      // Reads inside a transaction use `raw` and never wait on themselves.
      all: (statement, ...params) =>
        writes.then(() => raw.all(statement, ...params)),
    };
    const seed = new LibraryRepository(sql, "initializing");
    await seed.initialize();
    let device = await seed.setting("device");
    if (!device) {
      device = randomUUID();
      await seed.setSetting("device", device);
    }
    return new LibraryRepository(sql, device);
  })().catch(async (error) => {
    await releaseLibraryTab();
    opening = undefined;
    throw error;
  });
  return opening;
}
