// Lint fixture for rule 5: copy written into a screen instead of the catalogue. It plants ten
// strings, one per way of writing copy that the rule catches; the test expects ten messages.
// Linted only by scripts/lint-rules.test.ts, as a file in src/features/, src/app/ and src/ui/.
export function CopyEverywhere({ busy, name }: { busy: boolean; name?: string }) {
  return (
    <section title="Today">
      <h2>Breakfast</h2>
      <p>ご飯</p>
      <img src="/plate.png" alt="A plate of food" />
      <input placeholder={'Search foods'} />
      <button type="button" aria-label={`Remove ${name ?? ''}`}>
        ×
      </button>
      <p title={name ?? 'Unnamed'}>{'Nothing logged yet'}</p>
      <p>{busy ? 'Saving' : 'Saved'}</p>
    </section>
  );
}
