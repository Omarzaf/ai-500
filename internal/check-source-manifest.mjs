import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = "release-source-manifest.json";

/** Verify every approved source byte before tests, builds, or release publication. */
export function checkSourceManifest(root, { checkTracked = true } = {}) {
  const base = realpathSync(root);
  const manifestPath = join(base, manifestName);
  if (lstatSync(manifestPath).isSymbolicLink())
    throw new Error("Source manifest must not be a symlink");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest?.schemaVersion !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  )
    throw new Error("Invalid source manifest");
  const paths = new Set();
  const portablePaths = new Set();
  for (const entry of manifest.files) {
    const path = entry?.path;
    if (
      typeof path !== "string" ||
      !/^[A-Za-z0-9._/-]+$/.test(path) ||
      path
        .split("/")
        .some(
          (part) => !part || part === "." || part === ".." || part === ".git"
        ) ||
      path === manifestName
    )
      throw new Error(`Unsafe source path: ${String(path)}`);
    if (paths.has(path) || portablePaths.has(path.toLowerCase()))
      throw new Error(`Duplicate source path: ${path}`);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error(`Invalid source digest: ${path}`);
    paths.add(path);
    portablePaths.add(path.toLowerCase());
    let absolute = base;
    for (const part of path.split("/")) {
      absolute = join(absolute, part);
      if (lstatSync(absolute).isSymbolicLink())
        throw new Error(`Source symlink is not allowed: ${path}`);
    }
    if (
      !lstatSync(absolute).isFile() ||
      !realpathSync(absolute).startsWith(base + sep)
    )
      throw new Error(`Source must be a local file: ${path}`);
    const bytes = readFileSync(absolute);
    if (
      bytes.length !== entry.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw new Error(`Source integrity mismatch: ${path} (expected ${entry.bytes} bytes/${entry.sha256}; received ${bytes.length} bytes/${createHash("sha256").update(bytes).digest("hex")})`);
  }
  let trackedCount = null;
  if (checkTracked && existsSync(join(base, ".git"))) {
    const tracked = execFileSync(
      "git",
      ["-C", base, "ls-files", "--cached", "-z"],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    )
      .split("\0")
      .filter(Boolean);
    const missing = tracked.filter(
      (path) => path !== manifestName && !paths.has(path)
    );
    if (missing.length)
      throw new Error(
        `Tracked source missing from manifest: ${missing.join(", ")}`
      );
    trackedCount = tracked.length;
  }
  return { files: paths.size, trackedCount };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkSourceManifest(
    fileURLToPath(new URL("../", import.meta.url))
  );
  console.log(
    `Verified ${result.files} source files and hashes${result.trackedCount === null ? " (Git metadata absent)" : `; ${result.trackedCount} tracked paths accounted for`}.`
  );
}
