# 01 · Clean-room protocol

Platewise must behave like the reference app while every line of it is our own. This page says how
we work so that this is true, and how the repository proves it. It is an engineering process, not
legal advice.

## 1. Variant

**Read → Rewrite → Compare** (decided at intake, `00-decisions.md`). The reference is MIT-licensed,
and one lead agent drives builder sub-agents, so the strict two-team variant is not needed. A
builder may read the reference, but never writes while it is open, and reopens it afterwards only
to find gaps. Automated guards (§5) carry the proof.

## 2. The loop for every task

1. **Read.** Open the reference files that the phase file lists for the task. Read the research
   spec for the area first (`research/<nn>-*.md`), then the reference code, then its tests (they
   list the edge cases). REA Evidence in `~/rea-lab/` counts as reference material.
2. **Note.** Write the task note (`docs/notes/P<nn>/<slug>.md`, template `docs/notes/_template.md`)
   in our own words, before any code. Its `Read:` line is the audit trail.
3. **Rewrite.** Close the reference. Write from the note, the spec and the plan, with our names and
   our structure.
4. **Compare.** Reopen the reference and walk it branch by branch. Write each gap again in our
   own way and tick it in the note's compare checklist. Never paste to fill a gap.
5. **Check.** Run the tests, `pnpm check --require-ref`, and for UI flows the parity scenario
   (`02-rea-workflow.md` §4). A failure sends you back to step 3.

If you could delete the reference from disk and still explain every line you wrote, you rewrote
it. If a block only makes sense because you were looking at theirs, write it again.

## 3. What may be read, and when

| Source | Read | Rewrite | Compare | May enter the repo? |
|---|---|---|---|---|
| Reference source, docs, tests (`~/reference/fud-ai`) | yes | **no** | yes | never |
| REA Evidence and captures (`~/rea-lab/`) | yes | **no** | yes | never; an `ev_…` id may be cited |
| Store screenshots of the reference | yes | **no** | yes | never |
| Research specs, plan docs, task notes (our words) | yes | yes | yes | yes |
| Vendor API docs (Gemini, OpenAI, Anthropic, Open Food Facts, …) | yes | yes | yes | names and wire fields only, spelled exactly as the vendor spells them |

## 4. Never copy, and never carry the reference's names

| Allowed | Not allowed |
|---|---|
| Same behaviour, formulas, limits, timings, state machines | Copy-paste of any size, including "paste, then rename" |
| Same open-source libraries, used from their own upstream | Transcribing with the reference open beside yours |
| Our own tests for the same edge cases | Its tests, fixtures, snapshots, schemas, config, translations |
| Third-party protocol names, exactly | Its comments, docs text, AI prompt text, UI copy beyond 1–4 word labels |
| A similar module split where the concept demands it | Its assets: logo, icons, illustrations, colours, fonts, screenshots, exercise art |

- **AI prompts are prose.** The reference's prompts for food analysis, Coach and suggestions are
  its writing. We write our own prompts from the behaviour the research specs describe (inputs,
  required output fields, guard rails). The similarity check compares string literals as prose,
  so a recalled prompt is caught.
- **Models remember public code.** An agent can reproduce the reference from memory without
  opening it. The guards catch that too, so they run on every change.
- **Names.** The naming table (`17-naming-and-glossary.md`) maps every reference name to ours.
  Reference-only names are banned identifiers (`tooling/checks/banned-patterns.json`). They may
  appear only in `README.md`, `AGENTS.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md` and `docs/`.

## 5. Guards (from day 0)

One command runs them all: `pnpm check` (`tooling/checks/runAll.ts`). It runs every check even when
one fails, prints a summary and exits with the worst code: `0` clean, `1` violations, `2` setup
problem. Details: `docs/internals/checks.md`.

| Check | Compares | Fails when |
|---|---|---|
| `similarity` | Product code, Markdown, comments and string literals, against the pinned reference | A shared run of 50 code tokens, 6 meaningful lines or 12 words |
| `banned` | Every text file and path in `platewise/` outside the exempt docs | Any reference-only name |
| `assets` | SHA-256 of images, icons, fonts, sounds and videos on both sides | Any identical file |
| `licenses` | SPDX licences of production dependencies | A licence outside the allow-list without a reasoned exception |
| `traps` | `docs/internals/traps-ledger.md` against the research specs' trap lists | A trap without a row, or a row naming a test that does not exist |
| `acceptance` | `docs/internals/acceptance-map.md` against the feature inventory | A P0/P1 feature without an acceptance id mapped to a real test (`--strict` at release) |

Without the reference on disk, `similarity` and `assets` warn and skip. Every gate that counts as
evidence (CI, release) runs `pnpm check --require-ref`, which turns a missing reference into exit 2.
CI fetches the pinned commit outside the workspace, verifies the SHA, and sets `PLATEWISE_REF`.

## 6. Handling a similarity hit

A hit means "this region is not yet our own writing". The change waits until it is.

1. Read the hit: our file and lines, the reference file and lines, the shared excerpt.
2. **Prose** (a comment, a note, a prompt, UI copy): do not reword the sentence. Reread *our own
   code* that the text describes, then describe it from scratch.
3. **Code:** close the reference, reread the task note, and rewrite the region with our own
   structure (a different decomposition, a named helper, a different order of checks). Renaming
   variables never counts.
4. Rerun `pnpm check:similarity` and the module's tests.
5. Allow-list only legitimate overlap: generated code, or text fixed by a third-party protocol.
   Always write the reason.
6. Record it in the similarity report (`docs/internals/similarity-report-v<version>.md`).

## 7. Credits

- `THIRD_PARTY_NOTICES.md` keeps the reference's MIT notice as credit and says that Platewise was
  written from scratch and that `tooling/checks` checks it. The README and the About screen say
  the design is inspired by the reference.
- The reference's name, logo, icons, colours, illustrations and screenshots are never used as ours.
- Open datasets (for example a public exercise database in a later phase) are taken from their own
  upstream under their own licence, never from the reference's bundled copy.

## 8. Definition of done (per task)

1. The task note exists, and `Read:` lists the files and Evidence read.
2. The code was written from scratch with our names, and the compare checklist is complete.
3. Tests pass, including the edge cases from the reference's tests and the spec's traps.
4. `pnpm check --require-ref` is green.
5. For UI tasks, the parity scenario ran through REA and every divergence is classified.
