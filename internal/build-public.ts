import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readEdition, readPeople } from "./catalog.ts";
import { buildRelatedPeople } from "./explorer-data.ts";
import { renderExplorer } from "./explorer.ts";
import { readPortraits, validatePortraits } from "./portraits.ts";
import { createPublicRenderer, directoryStyles } from "./public-render.ts";

export interface PublicFile {
  path: string;
  routes: string[];
  type: string;
  bytes: number;
  sha256: string;
}

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character
  );
const text = (entry: Record<string, unknown>, field: string): string =>
  typeof entry[field] === "string" ? entry[field] : "";

const strings = (entry: Record<string, unknown>, field: string): string[] => {
  const value = entry[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};

function safeUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /[\s<>]/.test(value)
  )
    throw new Error("Unsafe photo credit URL");
  return escape(value);
}

function creditMetadata(
  input: unknown
): Record<string, Record<string, unknown>> {
  if (
    !input ||
    typeof input !== "object" ||
    !("records" in input) ||
    !input.records ||
    typeof input.records !== "object"
  )
    throw new Error("Missing photo credits");
  return input.records as Record<string, Record<string, unknown>>;
}

function assertLocalFile(root: string, relative: string): void {
  if (relative.startsWith("/") || relative.split("/").includes(".."))
    throw new Error("Unsafe source path");
  let current = root;
  for (const component of relative.split("/")) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink())
      throw new Error(`Symlink is not a release input: ${relative}`);
  }
  if (!realpathSync(current).startsWith(realpathSync(root) + sep))
    throw new Error(`Source path escaped release: ${relative}`);
}

/** Build the public site from validated catalog records and exact manifest-bound assets. */
export function buildPublic(root: string): PublicFile[] {
  if (lstatSync(root).isSymbolicLink())
    throw new Error("Release root must not be a symlink");
  const destination = join(root, "dist");
  for (const path of ["dist", "dist-manifest.json"]) {
    const absolute = join(root, path);
    if (lstatSync(absolute, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Output must not be a symlink: ${path}`);
  }
  for (const path of [
    "data/edition.json",
    "data/people.json",
    "data/portraits.json",
    "internal/explorer-client.js",
    "internal/motion-math.mjs",
    "internal/explorer.css",
  ])
    assertLocalFile(root, path);
  const edition = readEdition(root);
  const people = readPeople(root, edition);
  const rawPortraits: unknown = JSON.parse(
    readFileSync(join(root, "data/portraits.json"), "utf8")
  );
  const credits = creditMetadata(rawPortraits);
  const candidates = validatePortraits(rawPortraits, people);
  for (const portrait of Object.values(candidates)) {
    const entry = credits[portrait.id]!;
    if (entry.publicationReview !== "documented-license")
      throw new Error(
        `${portrait.id}: publication license has not been reviewed`
      );
    if (
      !/^(?:CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)(?: de)?|CC0(?: 1\.0)?|Public domain|Government Website Open Information Announcement \(GWOIA\))$/.test(
        portrait.license
      )
    )
      throw new Error(`${portrait.id}: unrecognized publication license`);
    if (!text(entry, "licenseUrl").startsWith("https://"))
      throw new Error(`${portrait.id}: missing license URL`);
    safeUrl(text(entry, "licenseUrl"));
    for (const url of strings(entry, "authorLinks")) safeUrl(url);
    if (text(entry, "adapterLicenseUrl"))
      safeUrl(text(entry, "adapterLicenseUrl"));
    assertLocalFile(root, `assets${portrait.src}`);
  }
  const portraits = readPortraits(root, people);
  const renderer = createPublicRenderer(edition, people);
  // Only this generated output directory is replaced; source and research files are untouched.
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  const files: PublicFile[] = [];
  const add = (
    path: string,
    content: string | Uint8Array,
    type: string,
    routes: string[]
  ) => {
    if (
      !/^[a-z0-9][a-z0-9/._-]*$/i.test(path) ||
      path.split("/").includes("..")
    )
      throw new Error(`Unsafe output path: ${path}`);
    const bytes =
      typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
    mkdirSync(dirname(join(destination, path)), { recursive: true });
    writeFileSync(join(destination, path), bytes);
    files.push({
      path,
      routes,
      type,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  };
  const html = "text/html; charset=utf-8";
  const json = "application/json; charset=utf-8";
  add("index.html", renderExplorer(), html, ["/", "/index.html"]);
  add(
    "404.html",
    renderer.page(
      "Page not found",
      '<div class="profile"><h1>Page not found.</h1><p><a href="/directory">Return to the directory →</a></p></div>'
    ),
    html,
    ["/404", "/404.html"]
  );
  add("directory.css", directoryStyles, "text/css; charset=utf-8", [
    "/directory.css",
  ]);
  for (const [name, type] of [
    ["explorer-client.js", "text/javascript; charset=utf-8"],
    ["motion-math.mjs", "text/javascript; charset=utf-8"],
    ["explorer.css", "text/css; charset=utf-8"],
  ]) {
    add(name!, readFileSync(join(root, "internal", name!)), type!, [
      `/${name}`,
    ]);
  }
  const portraitData = Object.fromEntries(
    Object.values(portraits).map(
      ({
        id,
        src,
        sourceUrl,
        credit,
        license,
        objectPosition,
        objectScale,
      }) => [
        id,
        { src, sourceUrl, credit, license, objectPosition, objectScale },
      ]
    )
  );
  add(
    "explorer-data.json",
    JSON.stringify({
      edition,
      people,
      related: buildRelatedPeople(people),
      portraits: portraitData,
    }),
    json,
    ["/api/explorer", "/explorer-data.json"]
  );
  add(
    "healthz.json",
    JSON.stringify({
      status: "ok",
      people: people.length,
      portraits: Object.keys(portraits).length,
    }),
    json,
    ["/healthz", "/healthz.json"]
  );
  for (const person of people)
    add(`people/${person.id}.html`, renderer.profile(person), html, [
      `/people/${person.id}`,
      `/people/${person.id}.html`,
    ]);
  const rows: string[] = [];
  for (const person of people) {
    const portrait = portraits[person.id];
    if (!portrait) continue;
    const entry = credits[person.id]!;
    const type = /\.png$/.test(portrait.src)
      ? "image/png"
      : /\.webp$/.test(portrait.src)
        ? "image/webp"
        : /\.avif$/.test(portrait.src)
          ? "image/avif"
          : "image/jpeg";
    add(
      portrait.src.slice(1),
      readFileSync(join(root, "assets", portrait.src)),
      type,
      [portrait.src]
    );
    const licenseUrl = text(entry, "licenseUrl");
    const requiredCredit = text(entry, "requiredCredit") || portrait.credit;
    const authors = strings(entry, "authorLinks");
    const creator =
      authors.length === 1
        ? `<a href="${safeUrl(authors[0]!)}" rel="noopener noreferrer">${escape(requiredCredit)}</a>`
        : escape(requiredCredit);
    const authorLinks =
      authors.length > 1
        ? `<p>${authors.map((url, index) => `<a href="${safeUrl(url)}" rel="noopener noreferrer">Author reference ${index + 1}</a>`).join(" · ")}</p>`
        : "";
    const title = text(entry, "title") || "Original photograph and source";
    const previousChanges = strings(entry, "previousChanges");
    const adapterLicense = text(entry, "adapterLicense");
    const adapterUrl = text(entry, "adapterLicenseUrl");
    rows.push(
      `<li id="${person.id}"><h2>${escape(person.name)}</h2><p>${creator}</p>${authorLinks}<p><a href="${safeUrl(portrait.sourceUrl)}" rel="noopener noreferrer">${escape(title)} →</a></p><p><a href="${safeUrl(licenseUrl)}" rel="noopener noreferrer">${escape(portrait.license)}</a></p>${text(entry, "attribution") ? `<p>${escape(text(entry, "attribution"))}</p>` : ""}<p>${escape(text(entry, "modificationNotice") || "Resized for display and framed in CSS; downloaded image bytes are unchanged.")}</p>${previousChanges.length ? `<p>Previous source changes: ${previousChanges.map(escape).join("; ")}</p>` : ""}${adapterLicense && adapterUrl ? `<p>Any copyrightable image adaptation from this display framing is offered under <a href="${safeUrl(adapterUrl)}" rel="noopener noreferrer">${escape(adapterLicense)}</a>.</p>` : ""}${text(entry, "restrictions") ? `<p>${escape(text(entry, "restrictions"))}</p>` : ""}</li>`
    );
  }
  add(
    "photo-credits.html",
    renderer.page(
      "Photo credits",
      `<article class="profile"><a class="back" href="/">← Return to explorer</a><h1>Photo credits</h1><p>These ${rows.length} source-attributed portraits accompany an editorial directory of 500 people. A photograph does not imply endorsement. Photos retain their individual rights and license terms. These image licenses do not grant rights to other site content.</p><p>Images are displayed with CSS framing and, for some portraits, scaling. The downloaded image bytes are unchanged. Copyright permissions do not waive personality, privacy, trademark, or other rights that may apply. Portrait identity and composition were reviewed with AI assistance.</p><ol class="sources">${rows.join("")}</ol></article>`
    ),
    html,
    ["/photo-credits", "/photo-credits.html"]
  );
  add("robots.txt", "User-agent: *\nAllow: /\n", "text/plain; charset=utf-8", [
    "/robots.txt",
  ]);
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  writeFileSync(
    join(root, "dist-manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        people: people.length,
        portraits: Object.keys(portraits).length,
        files,
      },
      null,
      2
    ) + "\n"
  );
  return files;
}

const invoked =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = buildPublic(root);
  console.log(
    `Public build: ${files.length} allowlisted files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`
  );
}
