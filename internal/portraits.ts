import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Portrait {
  id: string;
  name: string;
  status: "ready";
  src: string;
  sourceUrl: string;
  credit: string;
  license: string;
  sha256: string;
  bytes: number;
  objectPosition?: string;
  objectScale?: number;
}

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid portrait record"
  );
  return value as Record<string, unknown>;
}

/** Validate exact identity/asset mappings before exposing any portrait in the app. */
export function validatePortraits(
  input: unknown,
  people: readonly { id: string; name: string }[]
): Record<string, Portrait> {
  const manifest = record(input);
  ensure(manifest.schemaVersion === 1, "Unknown portrait manifest version");
  const records = record(manifest.records);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const result: Record<string, Portrait> = {};
  ensure(
    Object.keys(records).length === people.length,
    "Portrait coverage must account for every person"
  );
  for (const [id, raw] of Object.entries(records)) {
    const entry = record(raw);
    ensure(
      names.has(id) && entry.id === id && entry.name === names.get(id),
      `${id}: portrait identity mismatch`
    );
    if (entry.status === "unavailable") {
      ensure(
        typeof entry.reason === "string" &&
          entry.reason.length > 0 &&
          !entry.src,
        `${id}: missing portrait needs an explicit reason`
      );
      continue;
    }
    ensure(entry.status === "ready", `${id}: unreviewed portrait candidate`);
    ensure(
      typeof entry.src === "string" &&
        /^\/portraits\/[a-z0-9]+(?:-[a-z0-9]+)*\.(jpg|jpeg|png|webp|avif)$/.test(
          entry.src
        ),
      `${id}: unsafe portrait path`
    );
    ensure(
      entry.objectPosition === undefined ||
        (typeof entry.objectPosition === "string" &&
          /^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$/.test(entry.objectPosition)),
      `${id}: invalid portrait framing`
    );
    ensure(
      entry.objectScale === undefined ||
        (typeof entry.objectScale === "number" &&
          Number.isFinite(entry.objectScale) &&
          entry.objectScale >= 1 &&
          entry.objectScale <= 3),
      `${id}: invalid portrait scale`
    );
    ensure(
      entry.src.slice("/portraits/".length).replace(/\.[^.]+$/, "") === id,
      `${id}: portrait belongs to another person`
    );
    ensure(typeof entry.sourceUrl === "string", `${id}: missing source`);
    const url = new URL(entry.sourceUrl);
    ensure(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\s<>]/.test(entry.sourceUrl),
      `${id}: unsafe portrait source`
    );
    for (const field of ["credit", "license", "sha256"])
      ensure(
        typeof entry[field] === "string" && entry[field].trim(),
        `${id}: missing ${field}`
      );
    ensure(
      /^[a-f0-9]{64}$/.test(String(entry.sha256)),
      `${id}: invalid asset hash`
    );
    ensure(
      Number.isInteger(entry.bytes) &&
        Number(entry.bytes) >= 1000 &&
        Number(entry.bytes) <= 6_000_000,
      `${id}: invalid asset size`
    );
    result[id] = entry as unknown as Portrait;
  }
  return result;
}

/** Load only checked, identity-bound local raster images with matching file hashes. */
export function readPortraits(
  root: string,
  people: readonly { id: string; name: string }[]
): Record<string, Portrait> {
  const portraits = validatePortraits(
    JSON.parse(readFileSync(join(root, "data/portraits.json"), "utf8")),
    people
  );
  for (const portrait of Object.values(portraits)) {
    const image = readFileSync(join(root, "assets", portrait.src));
    ensure(
      image.length === portrait.bytes &&
        createHash("sha256").update(image).digest("hex") === portrait.sha256,
      `${portrait.id}: portrait bytes changed`
    );
    const valid = /\.jpe?g$/.test(portrait.src)
      ? image[0] === 255 && image[1] === 216
      : /\.png$/.test(portrait.src)
        ? image
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : /\.avif$/.test(portrait.src)
          ? image.subarray(4, 8).toString() === "ftyp" &&
            image.subarray(8, 40).includes(Buffer.from("avif"))
          : image.subarray(0, 4).toString() === "RIFF" &&
            image.subarray(8, 12).toString() === "WEBP";
    ensure(valid, `${portrait.id}: invalid raster image`);
  }
  return portraits;
}
