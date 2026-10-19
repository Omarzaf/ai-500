import test from "node:test";
import assert from "node:assert/strict";
import { validatePortraits } from "./portraits.ts";

const people = [
  { id: "fei-fei-li", name: "Fei-Fei Li" },
  { id: "aapo-hyvarinen", name: "Aapo Hyvärinen" },
];
function fixture() {
  return {
    schemaVersion: 1,
    records: {
      "fei-fei-li": {
        id: "fei-fei-li",
        name: "Fei-Fei Li",
        status: "ready",
        src: "/portraits/fei-fei-li.jpg",
        sourceUrl: "https://profiles.stanford.edu/fei-fei-li",
        credit: "Stanford University",
        license: "Rights not established",
        sha256: "a".repeat(64),
        bytes: 10000,
      },
      "aapo-hyvarinen": {
        id: "aapo-hyvarinen",
        name: "Aapo Hyvärinen",
        status: "unavailable",
        reason: "No reviewed portrait",
      },
    },
  };
}
test("portrait manifest accounts for missing images without inventing a photo", () => {
  const portraits = validatePortraits(fixture(), people);
  assert.deepEqual(Object.keys(portraits), ["fei-fei-li"]);
  assert.equal(portraits["fei-fei-li"]?.credit, "Stanford University");
});
test("portrait identity cannot silently resolve to another person", () => {
  const input = fixture();
  input.records["fei-fei-li"].src = "/portraits/aapo-hyvarinen.jpg";
  assert.throws(() => validatePortraits(input, people), /another person/);
  input.records["fei-fei-li"].src = "/portraits/fei-fei-li.jpg";
  input.records["fei-fei-li"].name = "Another person";
  assert.throws(() => validatePortraits(input, people), /identity mismatch/);
});
test("portrait paths and sources reject traversal, remote assets and script URLs", () => {
  for (const path of [
    "/portraits/../private.jpg",
    "https://external.test/photo.jpg",
    "/portraits/fei-fei-li.svg",
  ]) {
    const input = fixture();
    input.records["fei-fei-li"].src = path;
    assert.throws(
      () => validatePortraits(input, people),
      /unsafe portrait path/
    );
  }
  for (const source of [
    "javascript:alert(1)",
    "https://user:secret@example.com/image",
    "http://example.com/image",
  ]) {
    const input = fixture();
    input.records["fei-fei-li"].sourceUrl = source;
    assert.throws(
      () => validatePortraits(input, people),
      /unsafe portrait source/
    );
  }
});
test("unreviewed, incomplete and unverifiable portrait records fail closed", () => {
  const input = fixture();
  input.records["fei-fei-li"].status = "candidate";
  assert.throws(() => validatePortraits(input, people), /unreviewed/);
  input.records["fei-fei-li"].status = "ready";
  input.records["fei-fei-li"].sha256 = "";
  assert.throws(() => validatePortraits(input, people), /missing sha256/);
  assert.throws(
    () =>
      validatePortraits(fixture(), [
        ...people,
        { id: "new-person", name: "New Person" },
      ]),
    /account for every person/
  );
});
