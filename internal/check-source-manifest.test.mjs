import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSourceManifest } from "./check-source-manifest.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "ai500-source-integrity-"));
  const bytes = Buffer.from("approved source\n");
  const entry = {
    path: "source.txt",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const save = (files) =>
    writeFileSync(
      join(root, "release-source-manifest.json"),
      JSON.stringify({ schemaVersion: 1, files })
    );
  writeFileSync(join(root, entry.path), bytes);
  save([entry]);
  try {
    run({ root, entry, save });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("source integrity runs without Git and rejects changed bytes of identical length", () =>
  fixture(({ root }) => {
    assert.deepEqual(checkSourceManifest(root), {
      files: 1,
      trackedCount: null,
    });
    writeFileSync(join(root, "source.txt"), "tampered source\n");
    assert.throws(() => checkSourceManifest(root), /Source integrity mismatch/);
  }));

test("source integrity rejects unsafe and duplicate paths", () =>
  fixture(({ root, entry, save }) => {
    for (const path of [
      "/source.txt",
      "../source.txt",
      "a/../source.txt",
      "./source.txt",
      "a//source.txt",
      "a\\source.txt",
      ".git/config",
    ]) {
      save([{ ...entry, path }]);
      assert.throws(() => checkSourceManifest(root), /Unsafe source path/);
    }
    save([entry, entry]);
    assert.throws(() => checkSourceManifest(root), /Duplicate source path/);
  }));

test("source integrity rejects missing files and symlink substitutions", () =>
  fixture(({ root, entry }) => {
    const source = join(root, entry.path);
    const bytes = readFileSync(source);
    rmSync(source);
    assert.throws(() => checkSourceManifest(root), /ENOENT/);
    writeFileSync(join(root, "replacement.txt"), bytes);
    symlinkSync(join(root, "replacement.txt"), source);
    assert.throws(() => checkSourceManifest(root), /Source symlink/);
  }));

test("source integrity catches newly tracked files omitted from the manifest", () =>
  fixture(({ root }) => {
    execFileSync("git", ["init", "--quiet", root]);
    writeFileSync(join(root, "unlisted.txt"), "not approved");
    execFileSync("git", [
      "-C",
      root,
      "add",
      "source.txt",
      "unlisted.txt",
      "release-source-manifest.json",
    ]);
    assert.throws(
      () => checkSourceManifest(root),
      /Tracked source missing from manifest: unlisted.txt/
    );
  }));
