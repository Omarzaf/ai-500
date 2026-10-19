import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher: string;
  kind: "primary" | "secondary";
  checkedOn: string;
  publishedOn: string | null;
  note: string;
}

export interface Person {
  id: string;
  name: string;
  category: string;
  tags: string[];
  role: {
    title: string;
    organization: string;
    asOf: string | null;
    sourceIds: string[];
  };
  contribution: string;
  influence: string;
  claimSources: { contribution: string[]; influence: string[] };
  sources: Source[];
  reviewStatus: "ai-reviewed" | "human-reviewed";
  checkedOn: string;
  uncertainties?: string[];
}

export interface Edition {
  title: string;
  subtitle: string;
  editionDate: string;
  targetCount: number;
  humanReview: "pending" | "complete";
  categories: { id: string; title: string; description: string }[];
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, path: string): Record<string, unknown> {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path}: expected object`
  );
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  ensure(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value === value.trim(),
    `${path}: expected nonempty trimmed string`
  );
  ensure(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value),
    `${path}: control characters`
  );
  return value;
}

function date(value: unknown, path: string, maximum: string): string {
  const result = string(value, path);
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(result) &&
      new Date(result).toISOString().slice(0, 10) === result,
    `${path}: invalid date`
  );
  ensure(result <= maximum, `${path}: date is later than edition ${maximum}`);
  return result;
}

function strings(value: unknown, path: string, min = 1): string[] {
  ensure(
    Array.isArray(value) && value.length >= min,
    `${path}: expected at least ${min} entries`
  );
  const result = value.map((v, i) => string(v, `${path}[${i}]`));
  ensure(new Set(result).size === result.length, `${path}: duplicates`);
  return result;
}

export function identityKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function readEdition(root: string): Edition {
  const value = object(
    JSON.parse(
      readFileSync(join(root, "data/edition.json"), "utf8")
    ) as unknown,
    "edition"
  );
  const editionDate = date(value.editionDate, "editionDate", "9999-12-31");
  ensure(value.targetCount === 500, "edition.targetCount must be 500");
  ensure(
    value.humanReview === "pending" || value.humanReview === "complete",
    "edition.humanReview invalid"
  );
  ensure(
    Array.isArray(value.categories) && value.categories.length > 0,
    "edition.categories missing"
  );
  const categories = value.categories.map((v, i) => {
    const c = object(v, `category ${i}`);
    const id = string(c.id, "category.id");
    ensure(/^[a-z]+(?:-[a-z]+)*$/.test(id), "category.id invalid");
    return {
      id,
      title: string(c.title, "category.title"),
      description: string(c.description, "category.description"),
    };
  });
  ensure(
    new Set(categories.map((c) => c.id)).size === categories.length,
    "duplicate categories"
  );
  return {
    title: string(value.title, "edition.title"),
    subtitle: string(value.subtitle, "edition.subtitle"),
    editionDate,
    targetCount: 500,
    humanReview: value.humanReview,
    categories,
  };
}

export function validatePeople(
  input: unknown,
  edition: Edition,
  allowIncomplete = false
): Person[] {
  ensure(Array.isArray(input), "people: expected array");
  ensure(
    allowIncomplete
      ? input.length <= edition.targetCount
      : input.length === edition.targetCount,
    `Expected ${allowIncomplete ? "at most" : "exactly"} ${edition.targetCount} people; found ${input.length}`
  );
  const ids = new Set<string>();
  const names = new Set<string>();
  const categories = new Set(edition.categories.map((c) => c.id));
  const people = input.map((raw, index): Person => {
    const p = object(raw, `person ${index}`);
    const id = string(p.id, "person.id");
    ensure(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), `${id}: unsafe ID`);
    ensure(!ids.has(id), `${id}: duplicate ID`);
    ids.add(id);
    const name = string(p.name, `${id}.name`);
    const key = identityKey(name);
    ensure(!names.has(key), `${id}: duplicate identity ${name}`);
    names.add(key);
    const category = string(p.category, `${id}.category`);
    ensure(categories.has(category), `${id}: unknown category ${category}`);
    const checkedOn = date(p.checkedOn, `${id}.checkedOn`, edition.editionDate);
    ensure(
      Array.isArray(p.sources) && p.sources.length >= 2,
      `${id}: at least two sources required`
    );
    const sourceIds = new Set<string>();
    const urls = new Set<string>();
    const sources = p.sources.map((rawSource, s): Source => {
      const source = object(rawSource, `${id}.sources[${s}]`);
      const sid = string(source.id, `${id}.source.id`);
      ensure(
        /^[a-z][a-z0-9-]*$/.test(sid) && !sourceIds.has(sid),
        `${id}: invalid/duplicate source ID ${sid}`
      );
      sourceIds.add(sid);
      const url = string(source.url, `${id}.${sid}.url`);
      ensure(
        !/[\s<>]/u.test(url),
        `${id}: source URL contains unsafe characters`
      );
      const parsed = new URL(url);
      ensure(
        parsed.protocol === "https:" && !parsed.username && !parsed.password,
        `${id}: source URL must use HTTPS without credentials`
      );
      ensure(
        !/(^|\.)(example\.(com|org|net)|localhost)$/.test(parsed.hostname),
        `${id}: placeholder source`
      );
      ensure(
        !(
          /(^|\.)(google|bing)\.com$/.test(parsed.hostname) &&
          parsed.pathname.includes("search")
        ),
        `${id}: search page is not a source`
      );
      parsed.hash = "";
      parsed.search = "";
      const canonical = parsed.toString().replace(/\/$/, "");
      ensure(!urls.has(canonical), `${id}: duplicate source URL`);
      urls.add(canonical);
      ensure(
        source.kind === "primary" || source.kind === "secondary",
        `${id}: invalid source kind`
      );
      const sourceCheckedOn = date(
        source.checkedOn,
        `${id}.${sid}.checkedOn`,
        checkedOn
      );
      return {
        id: sid,
        url,
        title: string(source.title, `${id}.${sid}.title`),
        publisher: string(source.publisher, `${id}.${sid}.publisher`),
        kind: source.kind,
        checkedOn: sourceCheckedOn,
        publishedOn:
          source.publishedOn === null
            ? null
            : date(
                source.publishedOn,
                `${id}.${sid}.publishedOn`,
                sourceCheckedOn
              ),
        note: string(source.note, `${id}.${sid}.note`),
      };
    });
    ensure(
      sources.some((s) => s.kind === "primary"),
      `${id}: primary source missing`
    );
    function refs(value: unknown, field: string, min = 2): string[] {
      const result = strings(value, `${id}.${field}`, min);
      ensure(
        result.every((ref) => sourceIds.has(ref)),
        `${id}.${field}: unresolved source reference`
      );
      return result;
    }
    const role = object(p.role, `${id}.role`);
    const roleRefs = refs(role.sourceIds, "role.sourceIds", 1);
    ensure(
      roleRefs.some(
        (ref) => sources.find((s) => s.id === ref)?.kind === "primary"
      ),
      `${id}: role needs primary evidence`
    );
    const claimSources = object(p.claimSources, `${id}.claimSources`);
    ensure(
      p.reviewStatus === "ai-reviewed" || p.reviewStatus === "human-reviewed",
      `${id}: invalid reviewStatus`
    );
    ensure(
      edition.humanReview !== "complete" || p.reviewStatus === "human-reviewed",
      `${id}: human review claimed before completion`
    );
    const contribution = string(p.contribution, `${id}.contribution`);
    const influence = string(p.influence, `${id}.influence`);
    ensure(
      contribution.length >= 40 && influence.length >= 40,
      `${id}: contribution/rationale too short`
    );
    return {
      id,
      name,
      category,
      tags: strings(p.tags, `${id}.tags`),
      role: {
        title: string(role.title, `${id}.role.title`),
        organization: string(role.organization, `${id}.role.organization`),
        asOf:
          role.asOf === null
            ? null
            : date(role.asOf, `${id}.role.asOf`, checkedOn),
        sourceIds: roleRefs,
      },
      contribution,
      influence,
      claimSources: {
        contribution: refs(
          claimSources.contribution,
          "claimSources.contribution"
        ),
        influence: refs(claimSources.influence, "claimSources.influence"),
      },
      sources,
      reviewStatus: p.reviewStatus,
      checkedOn,
      ...(p.uncertainties === undefined
        ? {}
        : { uncertainties: strings(p.uncertainties, `${id}.uncertainties`) }),
    };
  });
  return people.sort(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id)
  );
}

export function readPeople(
  root: string,
  edition: Edition,
  allowIncomplete = false
): Person[] {
  return validatePeople(
    JSON.parse(readFileSync(join(root, "data/people.json"), "utf8")) as unknown,
    edition,
    allowIncomplete
  );
}
