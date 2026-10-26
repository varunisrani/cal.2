// Lint fixture (P00-07, rule 5): five pieces of copy written in place instead of in the catalogue.
export function NameField() {
  return (
    <label>
      Your name
      <input placeholder="Type a name" title="Name" aria-label="Name" />
      <img src="/icons/mark.svg" alt="A plate" />
    </label>
  );
}
