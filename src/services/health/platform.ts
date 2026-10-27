// Whether this copy of the app runs inside the Android shell (P11, D-16.89). The shell's native
// bridge puts a `Capacitor` object on the page before any script runs; a browser has none, so the
// web build and the installable web app never offer health features. Kept tiny and free of
// imports: the start-up code reads it before deciding to fetch anything health-related.

interface CapacitorGlobal {
  readonly Capacitor?: { readonly getPlatform?: () => string };
}

/** True only inside the Android app, where the Health Connect plugin exists. */
export function isHealthAvailable(): boolean {
  try {
    return (globalThis as CapacitorGlobal).Capacitor?.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}
