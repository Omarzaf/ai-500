import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEdition, readPeople } from "./catalog.ts";
import { createPublicRenderer } from "./public-render.ts";
import { buildPublic } from "./build-public.ts";
import { securityHeaders } from "./security.ts";
import directory from "../api/directory.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const edition = readEdition(root);
const people = readPeople(root, edition);
const renderer = createPublicRenderer(edition, people);

test("no-JavaScript directory applies query and category together", () => {
  const person = people.find((person) => person.id === "fei-fei-li")!;
  const html = renderer.directory(
    new URL(
      `https://test.invalid/directory?q=${encodeURIComponent(person.name)}&category=${person.category}`
    )
  );
  assert.match(html, /1 person matching/);
  assert.match(html, /href="\/people\/fei-fei-li"/);
  assert.doesNotMatch(html, /href="\/people\/geoffrey-hinton"/);
  const empty = renderer.directory(
    new URL("https://test.invalid/directory?q=Fei-Fei%20Li&category=invalid")
  );
  assert.match(empty, /No people match these filters/);
});

test("directory escapes reflected input and serves external CSS without inline executable content", () => {
  const html = renderer.directory(
    new URL(
      "https://test.invalid/directory?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&category=%22%3E%3Cimg%20onerror=alert(1)%3E"
    )
  );
  assert.doesNotMatch(html, /<script|<style|<img|onerror="/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="\/directory.css"/);
  assert.match(html, /href="\/photo-credits"/);
  assert.doesNotMatch(
    securityHeaders["Content-Security-Policy"],
    /unsafe-inline|unsafe-eval/
  );
});

test("public build emits only its explicit routes, never neighboring source files", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ai500-public-build-"));
  try {
    mkdirSync(join(temporary, "data"));
    mkdirSync(join(temporary, "internal"));
    for (const name of ["edition.json", "people.json"])
      writeFileSync(
        join(temporary, "data", name),
        readFileSync(join(root, "data", name))
      );
    writeFileSync(
      join(temporary, "data/portraits.json"),
      JSON.stringify({
        schemaVersion: 1,
        records: Object.fromEntries(
          people.map((person) => [
            person.id,
            {
              id: person.id,
              name: person.name,
              status: "unavailable",
              reason: "Synthetic build test omits images",
            },
          ])
        ),
      })
    );
    for (const name of [
      "explorer-client.js",
      "motion-math.mjs",
      "explorer.css",
    ])
      writeFileSync(
        join(temporary, "internal", name),
        "/* synthetic build fixture */"
      );
    writeFileSync(join(temporary, "AGENTS.md"), "PRIVATE SENTINEL");
    writeFileSync(join(temporary, ".env"), "PRIVATE SENTINEL");
    const files = buildPublic(temporary);
    assert.equal(
      files.filter((file) => /^people\//.test(file.path)).length,
      500
    );
    assert.equal(files.length, 510);
    assert.ok(
      files.every(
        (file) =>
          !/AGENTS|\.env|internal|research|archive|package/.test(file.path)
      )
    );
    assert.ok(
      files.every(
        (file) => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0
      )
    );
    assert.ok(files.some((file) => file.routes.includes("/photo-credits")));
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(temporary, "dist/explorer-data.json"), "utf8")
      ).portraits,
      {}
    );
    assert.equal(
      JSON.parse(readFileSync(join(temporary, "dist/healthz.json"), "utf8"))
        .people,
      500
    );
    const manifestPath = join(temporary, "data/portraits.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      records: Record<string, Record<string, unknown>>;
    };
    const person = people[0]!;
    const unavailable = manifest.records[person.id]!;
    const bytes = Buffer.alloc(1024);
    bytes[0] = 255;
    bytes[1] = 216;
    const entry: Record<string, unknown> = {
      id: person.id,
      name: person.name,
      status: "ready",
      src: `/portraits/${person.id}.jpg`,
      sourceUrl: "https://source.test/person",
      credit: "Synthetic credit",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
    manifest.records[person.id] = entry;
    const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
    save();
    assert.throws(
      () => buildPublic(temporary),
      /publication license has not been reviewed/
    );
    entry.publicationReview = "documented-license";
    entry.license = "Rights not established";
    save();
    assert.throws(
      () => buildPublic(temporary),
      /unrecognized publication license/
    );
    entry.license = "CC BY 4.0";
    mkdirSync(join(temporary, "assets/portraits"), { recursive: true });
    writeFileSync(join(temporary, "outside-image.jpg"), bytes);
    symlinkSync(
      join(temporary, "outside-image.jpg"),
      join(temporary, "assets", String(entry.src))
    );
    save();
    assert.throws(
      () => buildPublic(temporary),
      /Symlink is not a release input/
    );
    manifest.records[person.id] = unavailable;
    save();
    rmSync(join(temporary, "dist"), { recursive: true });
    symlinkSync(join(temporary, "does-not-exist"), join(temporary, "dist"));
    assert.throws(() => buildPublic(temporary), /Output must not be a symlink/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("production and local security header policies stay identical", () => {
  const config = JSON.parse(
    readFileSync(join(root, "vercel.json"), "utf8")
  ) as {
    outputDirectory: string;
    headers: { source: string; headers: { key: string; value: string }[] }[];
    rewrites: { source: string; destination: string }[];
  };
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(
    Object.fromEntries(
      config.headers[0]!.headers.map((header) => [header.key, header.value])
    ),
    securityHeaders
  );
  assert.deepEqual(
    config.rewrites.map((rewrite) => rewrite.source),
    ["/directory", "/api/explorer", "/healthz"]
  );
});

test("directory function limits methods and paths and preserves query filtering", async () => {
  const server = createServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const found = await fetch(`${base}/directory?q=Fei-Fei%20Li`);
    assert.equal(found.status, 200);
    assert.match(await found.text(), /1 person matching/);
    assert.equal(
      found.headers.get("content-security-policy"),
      securityHeaders["Content-Security-Policy"]
    );
    const head = await fetch(`${base}/directory`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const post = await fetch(`${base}/directory`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    assert.equal((await fetch(`${base}/data/people.json`)).status, 404);
    assert.equal(
      (await fetch(`${base}/directory?q=${"a".repeat(5000)}`)).status,
      414
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
