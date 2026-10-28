// The Google Drive sign-in plugin's contract (P15, D-16.97): the TypeScript side of the native
// plugin the Android app registers (`driveNative.ts`). It only asks Google for an access token
// for the `drive.file` scope; every Drive request is made by `driveClient.ts`. The interface is
// the phase file's, word for word; the lists and helpers after it are ours.

export interface DrivePlugin {
  authorize(o: { interactive: boolean }): Promise<{ accessToken: string; email: string | null }>; // rejects 'notConfigured' | 'cancelled' | 'unavailable' | 'unknown'
  signOut(): Promise<void>;
}

/** What a successful `authorize` gives. */
export type DriveGrant = Awaited<ReturnType<DrivePlugin['authorize']>>;

/** The codes an `authorize` call rejects with. */
export const DRIVE_ERROR_CODES = ['notConfigured', 'cancelled', 'unavailable', 'unknown'] as const;
export type DriveErrorCode = (typeof DRIVE_ERROR_CODES)[number];

/** The code a plugin rejection carries; `unknown` for anything else. */
export function driveErrorCode(error: unknown): DriveErrorCode {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return (DRIVE_ERROR_CODES as readonly unknown[]).includes(code)
    ? (code as DriveErrorCode)
    : 'unknown';
}
