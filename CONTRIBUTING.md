# Corrections and contributions

Use a GitHub issue or pull request to identify the person, disputed claim, and supporting public evidence. For role changes, provide dated institutional evidence where possible. Do not include private contact information, credentials, or unpublished correspondence.

Edit canonical records in `data/people.json`. Preserve source provenance, unknown dates, and review status. Entries require at least two substantive sources and claim-to-source references. Human review must not be claimed without actual review.

Portrait changes require an individually identified source, documented reuse terms, complete attribution, source and license links, a SHA-256 hash, and visual inspection of the small displayed crop. Unknown or conflicting rights use the unavailable state. Do not add unreviewed photographs.

After reviewing a source change, refresh that file’s byte count and SHA-256 entry in `release-source-manifest.json`; add entries for newly approved source files. Run `pnpm check:source` to detect stale hashes, unsafe paths, and tracked files missing from the manifest. This check also runs first in `pnpm verify` and works in deployment builds without Git metadata. A matching hash establishes file integrity; it does not approve a photograph, verify identity, or change reuse rights. Do not refresh entries merely to make an unreviewed change pass. Keep `vercel.json` in compact JSON with a final newline and explicit `name`/`version` metadata, matching Vercel’s build preparation so its exact source hash remains verifiable.

Keep `@types/node` aligned with the Node 22 runtime. Node type major upgrades and TypeScript major upgrades require separate migration review, including the Vercel compiler and emitted JavaScript runtime, rather than routine dependency updates.

Run `pnpm verify`. UI changes also require the relevant browser checks with an existing Playwright installation, using `AI500_PLAYWRIGHT_MODULE` to point to its entry module. Use a feature branch and pull request; review source/output changes before merging.
