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

The licences of the packages that ship in the app are listed by `pnpm licenses list --prod` and
checked against `tooling/checks/licenses.allow.json` by `pnpm check:licenses`.
