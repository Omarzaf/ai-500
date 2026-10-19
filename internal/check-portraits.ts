import { fileURLToPath } from "node:url";
import { readEdition, readPeople } from "./catalog.ts";
import { readPortraits } from "./portraits.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const people = readPeople(root, readEdition(root));
const portraits = readPortraits(root, people);
const imageOwners = new Map<string, string>();
for (const portrait of Object.values(portraits)) {
  const previous = imageOwners.get(portrait.sha256);
  if (previous)
    throw new Error(
      `Duplicate portrait image: ${previous} and ${portrait.id}; review source identity`
    );
  imageOwners.set(portrait.sha256, portrait.id);
}
console.log(
  `Verified ${Object.keys(portraits).length} unique portrait files and hashes; ${people.length - Object.keys(portraits).length} explicit unavailable entries.`
);
