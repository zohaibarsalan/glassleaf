export type DriveSyncTrigger = "startup" | "foreground" | "online" | "mutation";

export type DriveSyncScheduler = {
  request(trigger: DriveSyncTrigger): void;
  dispose(): void;
};

export function createDriveSyncScheduler({
  hasPending,
  isOnline = () => true,
  sync,
  onError,
  onSynced,
  delayMs = 750,
}: {
  hasPending: () => Promise<boolean>;
  isOnline?: () => boolean;
  sync: () => Promise<boolean>;
  onError: (error: unknown) => void;
  onSynced: () => void;
  delayMs?: number;
}): DriveSyncScheduler {
  const triggers = new Set<DriveSyncTrigger>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let disposed = false;
  let blocked = false;

  function queue() {
    if (timer || running || disposed) return;
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delayMs);
  }

  async function run() {
    if (disposed || running) return;
    running = true;
    const current = new Set(triggers);
    triggers.clear();
    try {
      if (!isOnline()) return;
      const remoteTrigger = ["startup", "foreground", "online"].some((key) =>
        current.has(key as DriveSyncTrigger),
      );
      if (!remoteTrigger && !(await hasPending())) return;
      if (await sync()) onSynced();
    } catch (error) {
      blocked = true;
      onError(error);
    } finally {
      running = false;
      if (triggers.size) queue();
    }
  }

  return {
    request(trigger) {
      if (disposed) return;
      if (blocked && trigger === "mutation") return;
      if (trigger !== "mutation") blocked = false;
      triggers.add(trigger);
      queue();
    },
    dispose() {
      disposed = true;
      triggers.clear();
      if (timer) clearTimeout(timer);
    },
  };
}
