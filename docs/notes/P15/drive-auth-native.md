# Task: Google Drive authorization, native side (P15-01) · Phase: 15 · Owner: builder (wt-p15s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../backup/DriveCloudBackupClient.kt` (the outline only:
which Google API it signs in with, which scopes, how it revokes) and `android/oauth.properties.example`
(what the owner must register), behaviour only. Ours: the P15 phase file (D-16.97, the
`DrivePlugin` contract), `scripts/notices.ts` (how Android libraries are listed), the
`play-services-auth` 22.0.0 AAR from Google Maven (its `AuthorizationClient`,
`AuthorizationRequest`, `AuthorizationResult`, `RevokeAccessRequest`, `ClearTokenRequest`, its
manifest and POM), Capacitor 7.6.9's `Plugin.java` (activity results).

What it does (own words): a Capacitor plugin `Drive` gets the web app an OAuth access token for
the person's Google Drive with the `drive.file` scope (Platewise sees only files it made), using
Google's Authorization API from Google Play services. Nothing about a password or a client secret
ever passes through Platewise: Google matches the app to an OAuth client by its package name and
signing key, which the owner registers once in Google Cloud. `authorize({ interactive: false })`
answers only when the person already allowed access (a fresh token comes back silently); with
`interactive: true` Google's own screen asks the person to pick an account and allow access when
needed. The token and, when Google gives it, the account's email go back to the web app, which
does all the Drive calls itself. `signOut()` gives the access back (revokes the grant for this
app) and forgets the account, so the next connect asks again.

Inputs → outputs:
- `authorize({ interactive })` → `{ accessToken, email }` (`email` null when Google does not say);
  rejects with `notConfigured` (no OAuth client matches this build: Google's developer error, or
  its sign-in failure that the same misconfiguration gives), `cancelled` (the person backed out,
  or consent is needed and the call is not interactive), `unavailable` (Google Play services
  missing, disabled, being updated or too old, or the API not on this phone), `unknown` (anything
  else, e.g. no network).
- `signOut()` → nothing; never rejects (what can be cleared is cleared).

Files:
- `android/app/src/main/java/app/platewise/android/drive/`: `DriveAuthorization.kt` (plain Kotlin:
  the scope, codes, status mapping, messages, the result's shape; JVM-tested), `DriveAccount.kt`
  (the remembered account name, in the app's private preferences), `DrivePlugin.kt` (Capacitor
  glue and the Google calls).
- `MainActivity.kt` (registration line), `android/app/build.gradle` and `variables.gradle`
  (`com.google.android.gms:play-services-auth`, `kotlinx-coroutines-play-services`).
- Tests in `android/app/src/test/java/app/platewise/android/drive/`, and the contract test.

Edge cases / failure modes:
- Google Play services missing or unusable: checked before any call → `unavailable`.
- Not interactive and Google wants the person (first connect, a revoked grant, a new scope):
  `cancelled`, without showing anything.
- Interactive: Google's screen opens from the plugin's own activity-result launcher (registered
  when the plugin loads, as Android requires); a closed screen (no result) → `cancelled`; a result
  is read back through the client, and its errors are mapped like the others.
- Two authorize calls at once: the second waits its turn behind the first (one screen at a time).
- The access token is never logged or stored by the plugin; the account name is kept (private
  app preferences) only so `signOut()` can revoke for that account after a restart.
- signOut offline or with Play services missing: the revoke fails quietly, the remembered account
  is still forgotten; the call resolves.

Our design differences / decisions:
- Scope `https://www.googleapis.com/auth/drive.file` only (D-16.97). The reference asks for its
  app-data folder and the email scope and passes a web client id for offline access; we ask for
  neither: no server, no refresh token, and the web app asks for a fresh token when one expires.
- No account picker of our own: Google's authorization screen chooses the account.
- `email` comes from the account Google returns with the grant; when it is missing the web app
  can read it from Drive itself (`about.get` with `fields=user`, allowed under `drive.file`).
  Decision for the lead (no extra scope asked).
- No client id in code or config: Android OAuth clients match by package and signing key.
- Error codes: DEVELOPER_ERROR (10) and SIGN_IN_FAILED (12500) → `notConfigured`; CANCELED (16),
  SIGN_IN_CANCELLED (12501) → `cancelled`; API_NOT_CONNECTED (17), SERVICE_VERSION_UPDATE_REQUIRED
  (2), SERVICE_DISABLED (3) → `unavailable`; everything else (network, internal, timeout) →
  `unknown`.
- signOut also clears the last token handed out this run (`clearToken`) so the next authorize
  does not get it back from Play services' cache, and Google's remembered account choice for the
  app (the sign-in client's sign-out), so the next connect asks which account.

Tests we will write (JVM):
- Status codes to contract codes, Play services availability codes to `unavailable`, messages
  carry the status number and no token.
- The contract: the plugin's methods, the result's keys and the rejection codes against the P15
  block; the plugin's registered name.

Compare checklist (filled after the rewrite; reopened `DriveCloudBackupClient.kt`, its
`authorize`, `outcome`, sign-in session and revoke parts):
- [x] Google's Authorization API, silent first and Google's own screen when a resolution is
      needed; the token comes from the result, or from the screen's answer (`DrivePlugin.kt`;
      device check)
- [x] sign-out takes the grant back and clears Google's remembered account so the next connect
      asks again (`DrivePlugin.kt`: `revokeAccess`, `clearToken`, the sign-in client's sign-out;
      device check)
- [x] Google statuses to the contract's codes, Play services state (`DriveTest` >
      googleStatusesBecomeTheContractCodes, aFailureNamesItsStatusAndCode, playServicesMustBeUsable)
- [x] the scope is `drive.file` only (`DriveTest` > theScopeIsDriveFileOnly)
- [x] the contract: methods, argument and result fields, rejection codes, plugin name (`DriveTest` >
      theContractMethodsArePluginMethods, authorizeTakesAndAnswersTheContractFields,
      rejectionCodesMatchTheContract, thePluginIsRegisteredAsDrive)
- Deliberate differences: `drive.file` instead of the app-data folder (D-16.97: the backups are
  files the person can see in Drive); no email scope and no userinfo call (the email comes with
  the grant, or the web reads it from Drive); no web client id, no offline access or server code
  (no server); no account picker of our own; revoke through the API rather than the token
  endpoint.
- Not taken: the reference's one-file backup kept up to date in place (S3 keeps the newest 7).

## Decisions for the lead

- `com.google.android.gms:play-services-auth` **22.0.0** (the latest on Google Maven, 2026-08-25;
  no newer stable), plus `org.jetbrains.kotlinx:kotlinx-coroutines-play-services` at the app's
  coroutines version (1.10.2) for `Task.await()` (play-services-auth already pulls in 1.8.0).
- Not interactive and Google needs the person: rejects `cancelled` (the contract has no "consent
  needed" code). S3: on `cancelled` from a background `authorize({ interactive: false })`, show
  "Connect again" rather than retrying silently.
- `email` may be null: it is read from the account Google returns with the grant, which the API
  does not promise to fill (not checked without a device); S3 can fall back to Drive's `about?fields=user` (works with
  `drive.file`). Without a known account, `signOut()` cannot revoke on Google's side (it still
  clears the token cache and the account choice).
- `signOut()` never rejects.
- New runtime libraries in the APK (Gradle's `releaseRuntimeClasspath` before and after):
  `com.google.android.gms:play-services-auth` 22.0.0, `play-services-auth-api-phone` 18.0.2,
  `play-services-auth-base` 18.0.10, `play-services-base` 18.5.0, `play-services-basement` 18.9.0,
  `play-services-fido` 20.0.1, `play-services-tasks` 18.2.0 (their POMs: "Android Software
  Development Kit License", https://developer.android.com/studio/terms.html, not an SPDX id; each
  AAR ships `third_party_licenses.txt` for the open-source code inside it, which Google asks apps
  to show), and `org.jetbrains.kotlinx:kotlinx-coroutines-play-services` 1.10.2 (Apache-2.0).
  Changed: `androidx.loader:loader` 1.0.0 → 1.1.0; gone: `androidx.lifecycle:lifecycle-livedata`
  2.6.2. `scripts/notices.ts` (ANDROID_LIBRARIES) and THIRD_PARTY_NOTICES.md need these (not
  touched here: outside S1's files).

## Status

Done (2026-10-28, base `648e6ca`): the Drive plugin, registered in `MainActivity`; its JVM tests
pass (8) with the rest. Not run: any call against Google (no device, no OAuth client yet: until
the owner registers one for `app.platewise.android` and the signing key's SHA-1, `authorize` is
expected to reject `notConfigured`; a device run must confirm which status Google gives then).
