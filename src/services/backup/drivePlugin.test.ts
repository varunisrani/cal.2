import { describe, expect, it } from 'vitest';
import { DRIVE_ERROR_CODES, driveErrorCode, type DrivePlugin } from './drivePlugin';
import { DRIVE_PLUGIN_NAME } from './driveNative';

describe('the Google Drive plugin contract (P15)', () => {
  it('names the methods of the phase file', () => {
    const methods: Record<keyof DrivePlugin, true> = { authorize: true, signOut: true };
    expect(Object.keys(methods)).toHaveLength(2);
    expect(DRIVE_PLUGIN_NAME).toBe('Drive');
  });

  it('reads the code a rejection carries, and calls anything else unknown', () => {
    expect([...DRIVE_ERROR_CODES]).toEqual([
      'notConfigured',
      'cancelled',
      'unavailable',
      'unknown',
    ]);
    for (const code of DRIVE_ERROR_CODES) {
      expect(driveErrorCode(Object.assign(new Error('refused'), { code }))).toBe(code);
    }
    expect(driveErrorCode({ code: 'DEVELOPER_ERROR' })).toBe('unknown');
    expect(driveErrorCode(new Error('plain'))).toBe('unknown');
    expect(driveErrorCode(null)).toBe('unknown');
  });
});
