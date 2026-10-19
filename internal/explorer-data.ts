import type { Person } from "./catalog.ts";

export interface RelatedPerson {
  id: string;
  sharedTags: string[];
}

const tagKey = (tag: string): string =>
  tag.normalize("NFKC").trim().toLowerCase();

/** Discover exact shared catalog labels; these links do not assert social relationships. */
export function buildRelatedPeople(
  people: Pick<Person, "id" | "name" | "tags">[]
): Record<string, RelatedPerson[]> {
  const tags = new Map(
    people.map((person) => [
      person.id,
      new Map(person.tags.map((tag) => [tagKey(tag), tag])),
    ])
  );
  return Object.fromEntries(
    people.map((person) => {
      const own = tags.get(person.id)!;
      const matches = people
        .filter((other) => other.id !== person.id)
        .map((other) => ({
          id: other.id,
          name: other.name,
          sharedTags: [...own]
            .filter(([key]) => tags.get(other.id)!.has(key))
            .map(([, label]) => label),
        }))
        .filter((other) => other.sharedTags.length > 0)
        .sort(
          (a, b) =>
            b.sharedTags.length - a.sharedTags.length ||
            a.name.localeCompare(b.name, "en") ||
            a.id.localeCompare(b.id, "en")
        )
        .slice(0, 6)
        .map(({ id, sharedTags }) => ({ id, sharedTags }));
      return [person.id, matches];
    })
  );
}
