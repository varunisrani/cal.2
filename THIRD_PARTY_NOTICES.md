# Third-party notices

## Design inspiration: Fud AI

Platewise's features and flows are inspired by **Fud AI** (https://github.com/apoorvdarshan/fud-ai),
an open-source calorie tracker for iOS and Android. Platewise is a separate product written from
scratch as a web app: no source code, text, prompts or assets were copied from it. The clean-room
guards in `tooling/checks` (similarity, banned identifiers, asset hashes) check this on every
change against the reference at commit `10e14b67116c52b515d2389621266e32b3a99840`.

Fud AI is distributed under the MIT License, reproduced here as credit:

```
MIT License

Copyright (c) 2026 Apoorv Darshan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime dependencies

<!-- Written by scripts/notices.ts from the installed packages (pnpm build runs it too).
Change the script, not this section or the next: the script writes the file from here on. -->

The packages that ship in the app, with their licences. The licence and notice texts each
package ships are in `src/generated/notices.json` and on the app's Licences and credits page;
`pnpm check:licenses` checks every licence against `tooling/checks/licenses.allow.json`. Code
that a package bundles under a licence of its own is listed under its own name.

- `@capacitor/core` 7.6.9: MIT, <https://capacitorjs.com>
- `@capacitor/local-notifications` 7.0.7: MIT
- `@types/emscripten` 1.41.6: MIT, <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/emscripten>
- `dexie` 4.4.6: Apache-2.0, <https://dexie.org>
- `react` 19.3.0: MIT, <https://react.dev/>
- `react-dom` 19.3.0: MIT, <https://react.dev/>
- `scheduler` 0.28.0: MIT, <https://react.dev/>
- `tagged-tag` 1.0.0: MIT
- `tslib` 2.8.1: 0BSD, <https://www.typescriptlang.org/>
- `type-fest` 5.10.0: (MIT OR CC0-1.0)
- `zint` (version not recorded): BSD-3-Clause, <https://sourceforge.net/projects/zint/>; bundled in `zxing-wasm` 3.1.5, which ships no copy of this licence text (it is at <https://sourceforge.net/p/zint/code/ci/master/tree/LICENSE>)
- `zxing-cpp` commit 2ecec3f: Apache-2.0, <https://github.com/zxing-cpp/zxing-cpp>; bundled in `zxing-wasm` 3.1.5, which ships no copy of this licence text (it is at <https://github.com/zxing-cpp/zxing-cpp/blob/master/LICENSE>)
- `zxing-wasm` 3.1.5: MIT, <https://github.com/Sec-ant/zxing-wasm>

## Android app

<!-- Written by scripts/notices.ts from its ANDROID_LIBRARIES table (pnpm build runs it too). -->

The Android app (`app.platewise.android`) is the web app above in a Capacitor shell. Its APK
also carries these libraries, as Gradle resolves them for it (`scripts/notices.ts` names the
command). The standard texts of their licences are in `scripts/licenses/`, unchanged from the
SPDX License List, and once each in `src/generated/notices.json`. The MIT and BSD-3-Clause
licences also ask for the copyright notice, given after the project page. The Android app
adds these libraries to its Licences and credits page, each with its licence text.

- `@capacitor/android` 7.6.9: MIT, <https://capacitorjs.com>; Copyright (c) 2017-present Drifty Co.
- `androidx.activity:activity` 1.9.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/activity>
- `androidx.annotation:annotation` 1.8.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/annotation>
- `androidx.annotation:annotation-experimental` 1.4.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/annotation>
- `androidx.annotation:annotation-jvm` 1.8.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/annotation>
- `androidx.appcompat:appcompat` 1.7.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/appcompat>
- `androidx.appcompat:appcompat-resources` 1.7.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/appcompat>
- `androidx.arch.core:core-common` 2.2.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/arch-core>
- `androidx.arch.core:core-runtime` 2.2.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/arch-core>
- `androidx.collection:collection` 1.4.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/collection>
- `androidx.collection:collection-jvm` 1.4.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/collection>
- `androidx.concurrent:concurrent-futures` 1.1.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/concurrent>
- `androidx.coordinatorlayout:coordinatorlayout` 1.2.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/coordinatorlayout>
- `androidx.core:core` 1.15.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/core>
- `androidx.core:core-ktx` 1.15.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/core>
- `androidx.core:core-splashscreen` 1.0.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/core>
- `androidx.cursoradapter:cursoradapter` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/cursoradapter>
- `androidx.customview:customview` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/customview>
- `androidx.drawerlayout:drawerlayout` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/drawerlayout>
- `androidx.emoji2:emoji2` 1.3.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/emoji2>
- `androidx.emoji2:emoji2-views-helper` 1.3.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/emoji2>
- `androidx.fragment:fragment` 1.8.4: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/fragment>
- `androidx.health.connect:connect-client` 1.1.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/health-connect>
- `androidx.health.connect:connect-client-external-protobuf` 1.1.0: BSD-3-Clause, <https://developer.android.com/jetpack/androidx/releases/health-connect>; Copyright 2008 Google Inc. All rights reserved.
- `androidx.health.connect:connect-client-proto` 1.1.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/health-connect>
- `androidx.interpolator:interpolator` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/interpolator>
- `androidx.lifecycle:lifecycle-common` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-livedata` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-livedata-core` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-process` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-runtime` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-viewmodel` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.lifecycle:lifecycle-viewmodel-savedstate` 2.6.2: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/lifecycle>
- `androidx.loader:loader` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/loader>
- `androidx.profileinstaller:profileinstaller` 1.3.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/profileinstaller>
- `androidx.resourceinspection:resourceinspection-annotation` 1.0.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/resourceinspection>
- `androidx.savedstate:savedstate` 1.2.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/savedstate>
- `androidx.startup:startup-runtime` 1.1.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/startup>
- `androidx.tracing:tracing` 1.2.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/tracing>
- `androidx.vectordrawable:vectordrawable` 1.1.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/vectordrawable>
- `androidx.vectordrawable:vectordrawable-animated` 1.1.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/vectordrawable>
- `androidx.versionedparcelable:versionedparcelable` 1.1.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/versionedparcelable>
- `androidx.viewpager:viewpager` 1.0.0: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/viewpager>
- `androidx.webkit:webkit` 1.12.1: Apache-2.0, <https://developer.android.com/jetpack/androidx/releases/webkit>
- `com.google.code.findbugs:jsr305` 3.0.2: BSD-3-Clause, <https://findbugs.sourceforge.net/>; Copyright (c) 2007-2009, JSR305 expert group. All rights reserved.
- `com.google.errorprone:error_prone_annotations` 2.11.0: Apache-2.0, <https://errorprone.info/>
- `com.google.guava:failureaccess` 1.0.1: Apache-2.0, <https://github.com/google/guava>
- `com.google.guava:guava` 31.1-android: Apache-2.0, <https://github.com/google/guava>
- `com.google.guava:listenablefuture` 9999.0-empty-to-avoid-conflict-with-guava: Apache-2.0, <https://github.com/google/guava>
- `com.google.j2objc:j2objc-annotations` 1.3: Apache-2.0, <https://github.com/google/j2objc>
- `org.apache.cordova:framework` 10.1.1: Apache-2.0, <https://cordova.apache.org/>
- `org.checkerframework:checker-qual` 3.12.0: MIT, <https://checkerframework.org/>; Copyright 2004-present by the Checker Framework developers
- `org.jetbrains.kotlin:kotlin-stdlib` 2.2.21: Apache-2.0, <https://kotlinlang.org/>
- `org.jetbrains.kotlinx:kotlinx-coroutines-android` 1.10.2: Apache-2.0, <https://github.com/Kotlin/kotlinx.coroutines>
- `org.jetbrains.kotlinx:kotlinx-coroutines-core` 1.10.2: Apache-2.0, <https://github.com/Kotlin/kotlinx.coroutines>
- `org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm` 1.10.2: Apache-2.0, <https://github.com/Kotlin/kotlinx.coroutines>
- `org.jetbrains.kotlinx:kotlinx-coroutines-guava` 1.10.2: Apache-2.0, <https://github.com/Kotlin/kotlinx.coroutines>
- `org.jetbrains:annotations` 23.0.0: Apache-2.0, <https://github.com/JetBrains/java-annotations>
- `org.jspecify:jspecify` 1.0.0: Apache-2.0, <https://jspecify.dev/>
