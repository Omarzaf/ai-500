import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  identityKey,
  readEdition,
  validatePeople,
  type Person,
} from "./catalog.ts";
import {
  escapeMarkdown,
  renderProfile,
  renderReadme,
} from "./generate-readme.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const edition = readEdition(root);
const template = readFileSync(
  join(root, "internal/README.template.md"),
  "utf8"
);

// Synthetic fixture; never included in the published catalog.
function fixture(): Person {
  return {
    id: "test-person",
    name: "Test Person",
    category: "research",
    tags: ["evaluation"],
    role: {
      title: "Researcher",
      organization: "Test Institute",
      asOf: null,
      sourceIds: ["s1"],
    },
    contribution:
      "Developed a documented method for evaluating model behavior.",
    influence: "The method provides a concrete basis for comparing AI systems.",
    claimSources: { contribution: ["s1", "s2"], influence: ["s1", "s2"] },
    sources: [
      {
        id: "s1",
        url: "https://institution.test/person",
        title: "Institutional biography",
        publisher: "Institution",
        kind: "primary",
        checkedOn: "2026-10-19",
        publishedOn: null,
        note: "Supports the role and method.",
      },
      {
        id: "s2",
        url: "https://journal.test/profile",
        title: "Independent profile",
        publisher: "Journal",
        kind: "secondary",
        checkedOn: "2026-10-19",
        publishedOn: "2026-01-01",
        note: "Corroborates the method and its use.",
      },
    ],
    reviewStatus: "ai-reviewed",
    checkedOn: "2026-10-19",
  };
}

test("release rejects 499 and 501 identities; accepts exactly 500", () => {
  const records = Array.from({ length: 501 }, (_, i) => ({
    ...fixture(),
    id: `test-${i}`,
    name: `Test Person ${i}`,
  }));
  assert.throws(
    () => validatePeople(records.slice(0, 499), edition),
    /exactly 500/
  );
  assert.throws(() => validatePeople(records, edition), /exactly 500/);
  assert.equal(validatePeople(records.slice(0, 500), edition).length, 500);
});

test("preview permits fewer people but visibly marks incomplete output", () => {
  const people = validatePeople([fixture()], edition, true);
  assert.match(
    renderReadme(people, edition, template),
    /RESEARCH DRAFT — 1 of 500/
  );
  assert.match(
    renderReadme(people, edition, template),
    /people\/test-person.md/
  );
});

test("rejects accent and punctuation identity aliases, independent of IDs", () => {
  assert.equal(identityKey("José O’Neil"), identityKey("Jose O'Neil"));
  assert.throws(
    () =>
      validatePeople(
        [
          { ...fixture(), name: "José O’Neil" },
          { ...fixture(), id: "different-id", name: "Jose O'Neil" },
        ],
        edition,
        true
      ),
    /duplicate identity/
  );
});

test("rejects duplicate IDs and path traversal", () => {
  assert.throws(
    () =>
      validatePeople(
        [fixture(), { ...fixture(), name: "Another Person" }],
        edition,
        true
      ),
    /duplicate ID/
  );
  assert.throws(
    () => validatePeople([{ ...fixture(), id: "../../README" }], edition, true),
    /unsafe ID/
  );
});

test("rejects missing, duplicate, and unresolved evidence", () => {
  const p = fixture();
  p.sources.pop();
  assert.throws(() => validatePeople([p], edition, true), /two sources/);
  const q = fixture();
  q.sources[1]!.url = q.sources[0]!.url + "?tracking=copy";
  assert.throws(
    () => validatePeople([q], edition, true),
    /duplicate source URL/
  );
  const r = fixture();
  r.claimSources.contribution = ["s1", "missing"];
  assert.throws(
    () => validatePeople([r], edition, true),
    /unresolved source reference/
  );
});

test("requires corroborating references and primary role evidence", () => {
  const p = fixture();
  p.claimSources.contribution = ["s1"];
  assert.throws(() => validatePeople([p], edition, true), /at least 2/);
  const q = fixture();
  q.role.sourceIds = ["s2"];
  assert.throws(
    () => validatePeople([q], edition, true),
    /role needs primary evidence/
  );
});

test("rejects future evidence, impossible dates, and unsupported human review", () => {
  const p = fixture();
  p.checkedOn = "2026-10-20";
  assert.throws(() => validatePeople([p], edition, true), /later than edition/);
  const q = fixture();
  q.role.asOf = "2026-02-30";
  assert.throws(() => validatePeople([q], edition, true), /invalid date/);
  assert.throws(
    () =>
      validatePeople(
        [fixture()],
        { ...edition, humanReview: "complete" },
        true
      ),
    /human review claimed/
  );
});

test("rejects a source checked before its publication date", () => {
  const p = fixture();
  p.sources[1]!.checkedOn = "2026-01-01";
  p.sources[1]!.publishedOn = "2026-10-18";
  assert.throws(() => validatePeople([p], edition, true), /s2.publishedOn/);
  p.sources[1]!.publishedOn = "2026-01-01";
  assert.equal(validatePeople([p], edition, true).length, 1);
});

test("rejects search and placeholder URLs and unknown categories", () => {
  for (const url of [
    "https://example.com/profile",
    "https://www.google.com/search?q=person",
    "http://institution.test/person",
    "https://institution.test/><script>",
  ]) {
    const p = fixture();
    p.sources[0]!.url = url;
    assert.throws(() => validatePeople([p], edition, true));
  }
  assert.throws(
    () =>
      validatePeople([{ ...fixture(), category: "made-up" }], edition, true),
    /unknown category/
  );
});

test("rendering escapes table/HTML content, preserves accented names, and exposes evidence age", () => {
  const p = {
    ...fixture(),
    name: "Zoë | <script>",
    uncertainties: ["Role source may be old."],
  };
  const profile = renderProfile(p, edition);
  assert.match(profile, /Zoë \\\| &lt;script&gt;/);
  assert.doesNotMatch(profile, /<script>/);
  assert.match(profile, /Role date not established/);
  assert.match(profile, /human editorial review pending/);
  assert.match(profile, /Role source may be old/);
  assert.equal(escapeMarkdown("A & B\nC"), "A &amp; B C");
});

test("generation is deterministic and template markers cannot silently disappear", () => {
  const p = fixture();
  assert.equal(
    renderReadme([p], edition, template),
    renderReadme([p], edition, template)
  );
  assert.throws(() => renderReadme([p], edition, "No markers"), /exactly one/);
});
