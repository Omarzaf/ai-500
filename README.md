# AI 500

An interactive, source-backed directory of 500 people shaping artificial intelligence, across research, industry, infrastructure, open source, safety, policy, society, and applications.

The explorer supports search, keyboard navigation, readable individual profiles, shared-tag connections, reduced motion, and an accessible directory that works without JavaScript. This is an editorial selection, not a ranking or endorsement. Source dates and documented limitations remain visible.

## Public edition

All 500 profiles are included. Only portraits with reviewed, documented reuse terms are distributed; other profiles show initials. See the site's **Photo credits** page for each image's creator, original source, license, and framing notice. Public-source availability alone is not treated as a reuse license.

[Methodology](METHODOLOGY.md) · [Corrections and contributions](CONTRIBUTING.md) · [Security](SECURITY.md) · [Rights and notices](NOTICE.md)

## Develop and verify

Requires Node.js 22 and pnpm 10.15.0.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify
pnpm preview
```

The preview defaults to http://127.0.0.1:4175. Build output is limited to an explicit file manifest in `dist/`. The single server function supports the directory's search/filter form without JavaScript. No database, account system, analytics, or production application dependency is required.

Canonical data lives in `data/people.json`, `data/edition.json`, and `data/portraits.json`. The public repository contains only release sources and included images; private research inputs and original repository history are excluded.

## Deployment

Vercel uses the checked-in configuration, runs verification before building, and serves only `dist/` plus the directory function. Deployments must pass CI and public-route/asset checks. This repository does not include deployment credentials.

All profiles combine AI-assisted research with completed human editorial review. Automated tests establish structure and behavior, not factual completeness or current accuracy of every biography.
