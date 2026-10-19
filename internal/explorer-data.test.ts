import test from "node:test";
import assert from "node:assert/strict";
import { buildRelatedPeople } from "./explorer-data.ts";

test("connections require shared catalog tags, exclude self, and retain the reason", () => {
  const result = buildRelatedPeople([
    { id: "one", name: "One", tags: ["Deep Learning", "Open models"] },
    { id: "two", name: "Two", tags: ["deep learning", "open models"] },
    { id: "three", name: "Three", tags: ["deep learning"] },
    { id: "four", name: "Four", tags: ["Climate"] },
  ]);
  assert.deepEqual(result.one, [
    { id: "two", sharedTags: ["Deep Learning", "Open models"] },
    { id: "three", sharedTags: ["Deep Learning"] },
  ]);
  assert.deepEqual(result.four, []);
});

test("links do not infer synonyms, substring matches, or organization ties", () => {
  assert.deepEqual(
    buildRelatedPeople([
      { id: "one", name: "One", tags: ["AI", "neural networks"] },
      { id: "two", name: "Two", tags: ["AI policy", "deep learning"] },
    ]),
    { one: [], two: [] }
  );
});

test("related selection is capped and independent of input order", () => {
  const people = Array.from({ length: 12 }, (_, i) => ({
    id: `person-${i}`,
    name: `Person ${String(i).padStart(2, "0")}`,
    tags: ["models", "MODELS"],
  }));
  const result = buildRelatedPeople(people);
  assert.deepEqual(result, buildRelatedPeople([...people].reverse()));
  assert.equal(result["person-0"]?.length, 6);
  assert.ok(
    Object.values(result)
      .flat()
      .every((link) => link.sharedTags.length === 1)
  );
});
