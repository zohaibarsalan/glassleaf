import type { LibraryRepository } from "@glassleaf/library";
export const driveConfigured = false;
export async function connectDrive(_repo: LibraryRepository): Promise<void> {
  throw new Error(
    "Google Drive sign-in is available in the installed mobile app.",
  );
}
export async function disconnectDrive(
  _repo: LibraryRepository,
): Promise<void> {}
export async function syncDrive(
  _repo: LibraryRepository,
  _status: (message: string) => void,
): Promise<void> {
  throw new Error("Use the installed app to sync Google Drive.");
}
