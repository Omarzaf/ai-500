# Corrections and contributions

Use a GitHub issue or pull request to identify the person, disputed claim, and supporting public evidence. For role changes, provide dated institutional evidence where possible. Do not include private contact information, credentials, or unpublished correspondence.

Edit canonical records in `data/people.json`. Preserve source provenance, unknown dates, and review status. Entries require at least two substantive sources and claim-to-source references. Human review must not be claimed without actual review.

Portrait changes require an individually identified source, documented reuse terms, complete attribution, source and license links, a SHA-256 hash, and visual inspection of the small displayed crop. Unknown or conflicting rights use the unavailable state. Do not add unreviewed photographs.

Run `pnpm verify`. UI changes also require the relevant browser checks with an existing Playwright installation, using `AI500_PLAYWRIGHT_MODULE` to point to its entry module. Use a feature branch and pull request; review source/output changes before merging.
