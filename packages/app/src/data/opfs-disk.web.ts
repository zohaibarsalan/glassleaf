import type { FileDisk } from "./blob-store";
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (blob: Blob | undefined) => void; reject: (error: Error) => void }
>();
function request(
  operation: "read" | "write" | "remove",
  name: string,
  blob?: Blob,
): Promise<Blob | undefined> {
  if (!worker) {
    worker = new Worker("/glassleaf-files-worker.js", { type: "module" });
    worker.onmessage = ({
      data,
    }: {
      data: { id: number; blob?: Blob; error?: string };
    }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.blob);
    };
    worker.onerror = () => {
      const error = new Error(
        "Book storage could not start. Reload the app and try again.",
      );
      for (const job of pending.values()) job.reject(error);
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, operation, name, blob });
  });
}
export const opfsDisk: FileDisk = {
  read: (name) => request("read", name),
  write: async (name, blob) => {
    await request("write", name, blob);
  },
  remove: async (name) => {
    await request("remove", name);
  },
};
