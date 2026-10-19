# Security policy

Report suspected vulnerabilities through this repository's private vulnerability-reporting channel when available. Do not post credentials, private personal data, or exploitable secret material in a public issue. Ordinary content corrections belong in issues as described in CONTRIBUTING.md.

## Release controls

- Explicit public-source and built-file lists; no research archives, environment files, credentials, or inherited Git history.
- Canonical catalog validation, portrait identity/hash checks, documented image reuse terms, and duplicate-photo rejection.
- Static output allowlist plus one query-only directory function; GET/HEAD handling and input length limits.
- Same-origin Content Security Policy, no inline scripts, frame blocking, MIME sniffing protection, restrictive browser permissions, and no-referrer policy.
- Reproducible lockfile, dependency audit, pinned CI actions, read-only workflow tokens, and no deploy secrets in pull-request jobs.
- Source secret scan, browser checks, and deployed byte/hash and excluded-route verification before release acceptance.

No audit can establish the absence of every vulnerability. These controls cover the committed release and its configured deployment; third-party sources and future changes require separate review.
