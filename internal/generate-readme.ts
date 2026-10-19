import type { Edition, Person } from "./catalog.ts";

export function escapeMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_\[\]|])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

function citations(person: Person, refs: string[]): string {
  return refs
    .map((ref) => {
      const source = person.sources.find((s) => s.id === ref);
      if (!source) throw new Error(`${person.id}: unresolved reference ${ref}`);
      return `[${person.sources.indexOf(source) + 1}](<${source.url}>)`;
    })
    .join(", ");
}

export function renderProfile(person: Person, edition: Edition): string {
  const category = edition.categories.find((c) => c.id === person.category);
  if (!category) throw new Error(`Unknown category ${person.category}`);
  const e = escapeMarkdown;
  return [
    "<!-- Generated from data/people.json. Edit the canonical record, then run pnpm generate. -->",
    "",
    "[← AI 500 directory](../README.md)",
    "",
    `# ${e(person.name)}`,
    "",
    `**${e(category.title)}** · ${person.tags.map(e).join(" · ")}`,
    "",
    `**Role reported by sources:** ${e(person.role.title)}, ${e(person.role.organization)}. ${citations(person, person.role.sourceIds)}`,
    "",
    person.role.asOf
      ? `Role evidence dated ${person.role.asOf}. Sources checked ${person.checkedOn}.`
      : `Role date not established. Sources checked ${person.checkedOn}. This check date does not establish when the source was last updated.`,
    "",
    "## Contribution",
    "",
    `${e(person.contribution)} ${citations(person, person.claimSources.contribution)}`,
    "",
    "## Why included",
    "",
    `${e(person.influence)} ${citations(person, person.claimSources.influence)}`,
    "",
    "This inclusion rationale is an editorial assessment. It is not a rank, endorsement, or quantitative measure of influence.",
    "",
    ...(person.uncertainties?.length
      ? [
          "## Evidence limitations",
          "",
          ...person.uncertainties.map((x) => `- ${e(x)}`),
          "",
        ]
      : []),
    "## Sources",
    "",
    ...person.sources.flatMap((s, i) => [
      `${i + 1}. [${e(s.title)}](<${s.url}>) — ${e(s.publisher)}; ${s.kind} source. ${s.publishedOn ? `Published ${s.publishedOn}.` : "Publication date not established."} Checked ${s.checkedOn}.`,
      `   ${e(s.note)}`,
      "",
    ]),
    `**Review:** ${person.reviewStatus === "human-reviewed" ? "Human reviewed." : "AI-assisted source review; human editorial review pending."}`,
    "",
    "[Selection method](../METHODOLOGY.md) · [Corrections](../CONTRIBUTING.md)",
    "",
  ].join("\n");
}

export function renderReadme(
  people: Person[],
  edition: Edition,
  template: string
): string {
  const e = escapeMarkdown;
  for (const marker of [
    "<!-- STATUS -->",
    "<!-- CONTENTS -->",
    "<!-- DIRECTORY -->",
  ])
    if (template.split(marker).length !== 2)
      throw new Error(`Template needs exactly one ${marker}`);
  const complete = people.length === edition.targetCount;
  const status = complete
    ? `**${people.length} people · Edition ${edition.editionDate} · ${edition.humanReview === "complete" ? "Human reviewed" : "AI-assisted research; human editorial review pending"}**`
    : `**RESEARCH DRAFT — ${people.length} of ${edition.targetCount} profiles assembled. This is not the completed AI 500 selection.**`;
  const contents = edition.categories
    .map(
      (c) =>
        `- [${e(c.title)}](#${c.id}) — ${people.filter((p) => p.category === c.id).length}`
    )
    .join("\n");
  const directory = edition.categories
    .map((category) => {
      const members = people.filter((p) => p.category === category.id);
      return [
        `<a id="${category.id}"></a>`,
        "",
        `## ${e(category.title)}`,
        "",
        e(category.description),
        "",
        ...(members.length
          ? [
              "| Person | Role reported by sources | Contribution |",
              "| --- | --- | --- |",
              ...members.map(
                (p) =>
                  `| [${e(p.name)}](people/${p.id}.md) | ${e(p.role.title)} · ${e(p.role.organization)} | ${e(p.contribution)} |`
              ),
            ]
          : ["Profiles are being researched for this category."]),
        "",
      ].join("\n");
    })
    .join("\n");
  return (
    "<!-- Generated from data/people.json, data/edition.json, and internal/README.template.md. Run pnpm generate. -->\n\n" +
    template
      .replace("<!-- STATUS -->", status)
      .replace("<!-- CONTENTS -->", contents)
      .replace("<!-- DIRECTORY -->", directory)
  );
}
