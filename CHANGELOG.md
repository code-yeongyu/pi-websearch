# Changelog

## 0.4.0 - 2026-09-24

### Added

- Kagi search provider (`POST https://kagi.com/api/v1/search`, Bearer auth, lens domain filters) — thanks @ankarhem (#9).
- SERPdive search provider (`POST https://api.serpdive.com/v1/search`, Bearer auth, extracted page content as snippet) — thanks @edendalexis (#7).

### Changed

- Move CI to Bun `1.4.2` (`oven-sh/setup-bun@v2`) with a Node 22/24 matrix on Ubuntu and macOS, plus an `npm ci` consumer job.
- Add `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` as exact `0.87.1` devDependencies. Peer range for `@earendil-works/pi-*` stays `*` so date-versioned downstream runtimes still resolve.
- Accept `ExtensionContext` in `web_search` execute and `string | null` native auth headers so the tool type-checks against pi 0.87.
- Refresh toolchain: `@biomejs/biome` 2.5.5 → 2.5.14, `vitest` 4.1.x → 5.0.1, `@types/node` 25.x → 26.6.2, `@typescript/native-preview` → `7.0.0-dev.20260707.2`, `typebox` 1.3.34 (dev). `typescript` stays 7.0.2 (exact).
- Document Bun as the preferred install/dev toolchain; npm remains a supported consumer path.

### CI

- `actions/checkout@v7`, `actions/setup-node@v7`.
- Jobs: `test` (`bun install --frozen-lockfile`, `bun run check`, `bun run test`, `npm pack --dry-run`) and `npm-consumer` (`npm ci`, `npm test`).
