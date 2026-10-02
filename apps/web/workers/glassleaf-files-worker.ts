/// <reference lib="webworker" />
export {};
type Request = {
  id: number;
  operation: "read" | "write" | "remove";
  name: string;
  blob?: Blob;
};
const missing = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError";
let directory: Promise<FileSystemDirectoryHandle> | undefined;
const root = () =>
  (directory ??= navigator.storage
    .getDirectory()
    .then((d) => d.getDirectoryHandle("glassleaf-books", { create: true })));
async function operation(message: Request) {
  if (!/^[a-zA-Z0-9_-]+$/.test(message.name))
    throw new Error("Invalid local file identifier.");
  const dir = await root();
  if (message.operation === "remove") {
    await dir.removeEntry(message.name).catch((error) => {
      if (!missing(error)) throw error;
    });
    return;
  }
  if (message.operation === "read") {
    try {
      return await (await dir.getFileHandle(message.name)).getFile();
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
  }
  const blob = message.blob;
  if (!blob) throw new Error("Missing file content.");
  const file = await dir.getFileHandle(message.name, { create: true });
  const handle = await file.createSyncAccessHandle();
  try {
    let offset = 0;
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let written = 0;
        while (written < value.byteLength) {
          const count = handle.write(value.subarray(written), {
            at: offset + written,
          });
          if (!count)
            throw new Error("The browser could not finish writing the book.");
          written += count;
        }
        offset += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== blob.size)
      throw new Error("The downloaded file is incomplete.");
    handle.truncate(offset);
    handle.flush();
  } finally {
    handle.close();
  }
}
self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  void operation(request).then(
    (blob) => self.postMessage({ id: request.id, blob }),
    (error) =>
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});
