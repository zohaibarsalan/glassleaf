import assert from "node:assert/strict";
import { test } from "node:test";
import { createDriveSyncScheduler } from "./drive-scheduler";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

test("coalesces local changes and a foreground event into one sync", async () => {
  let syncs = 0;
  let completed = 0;
  const scheduler = createDriveSyncScheduler({
    hasPending: async () => true,
    sync: async () => {
      syncs += 1;
      return true;
    },
    onError: () => assert.fail("scheduler error"),
    onSynced: () => {
      completed += 1;
    },
    delayMs: 1,
  });
  scheduler.request("mutation");
  scheduler.request("foreground");
  scheduler.request("online");
  await wait(20);
  scheduler.dispose();
  assert.equal(syncs, 1);
  assert.equal(completed, 1);
});

test("does not retry an expired token until a new trigger arrives", async () => {
  let syncs = 0;
  let errors = 0;
  const scheduler = createDriveSyncScheduler({
    hasPending: async () => true,
    sync: async () => {
      syncs += 1;
      throw new Error("Reconnect Google Drive first.");
    },
    onError: () => {
      errors += 1;
    },
    onSynced: () => assert.fail("expired token should not sync"),
    delayMs: 1,
  });
  scheduler.request("mutation");
  await wait(20);
  assert.equal(syncs, 1);
  assert.equal(errors, 1);
  scheduler.request("mutation");
  await wait(20);
  assert.equal(syncs, 1);
  scheduler.request("online");
  await wait(20);
  scheduler.dispose();
  assert.equal(syncs, 2);
});
