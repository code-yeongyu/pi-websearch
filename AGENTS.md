# Repository Conventions

Conventions for human contributors and AI agents working on this repository.

## Style

- Terse technical prose. No emojis in commits, issues, PR comments, or code.
- TypeScript strict mode. No `any`, no `unknown` casts where avoidable, no `@ts-ignore`, no `@ts-expect-error`, no enums.
- ESM modules with `.js` suffix in import paths (Node16 resolution).
- Tabs for indentation. Double quotes for strings.
- Tests use vitest with `#given .. #when .. #then` description style or plain `// given / // when / // then` body comments.

## Commands

- `npm install` — install dependencies.
- `npm test` — run vitest test suite once.
- `npm run typecheck` — strict TypeScript check.
- `npm run check` — type check + biome.
- `pi -e ./src/index.ts` — load the extension into a local pi session for manual smoke testing.

## Constraints

- No Bun APIs. Runtime is Node 20+.
- The extension is standalone and depends only on the public pi extension API.
- Provider configuration is explicit: no config means the extension refuses to activate and surfaces a TUI startup error.
- Exa, Tavily, Brave, Serper, Google CSE, Z.ai, OpenAI/Codex hosted search, Anthropic Messages search, Perplexity, and xAI require their documented credentials.
- `auto` (default `true`) prepends an implicit `native` entry when `ExtensionContext.model` matches a server-hosted-search-supported provider+model combo. Native entry inherits auth via `ExtensionContext.modelRegistry.getApiKeyAndHeaders`, preserves `model.baseUrl` (so local gateway overrides such as `anthropic`, `anthropic`, or any `~/.senpi/agent/models.json` override flow through), and routes through the existing provider adapter; explicit `providers` remain the fallback chain. Recognized provider aliases: `anthropic` for Anthropic, `zai` for `z-ai`, and `openrouter` model ids of the form `<upstream>/<model>` are unwrapped before matching.
- TUI rendering reads typed `details` returned by tool `execute`; renderers never parse formatted strings.
