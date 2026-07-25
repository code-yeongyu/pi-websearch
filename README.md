# pi-websearch

Provider-backed `web_search` tool for pi. It starts with zero configuration: OpenAI and Anthropic sessions defer silently to senpi's built-in provider-native web search, while other providers use the built-in DuckDuckGo HTML backend unless a config file overrides it.

## Tool Schema

The public tool schema matches free-code:

```json
{
	"query": "The search query to use",
	"allowed_domains": ["example.com"],
	"blocked_domains": ["spam.example.com"]
}
```

Only `query` is required. `allowed_domains` and `blocked_domains` are mutually exclusive for a single tool call. Result limits are configured per provider, not exposed in the tool schema.

## Configuration

The loader checks these files in order:

1. `.pi/websearch.json` in the current project
2. `~/websearch.json`
3. `~/.pi/websearch.json`

No config file is required for the default backend. For non-native providers, pi-websearch uses DuckDuckGo's HTML endpoint (`https://html.duckduckgo.com/html/`) because it is free and does not require an API key. Create a config file only when you want a different backend or routing policy.

Example override:

```json
{
	"backend": "perplexity",
	"apiKey": "pplx-...",
	"maxResults": 8,
	"allowedDomains": ["docs.example.com"]
}
```

Legacy configs that use `"provider"` instead of `"backend"` continue to work.

Multiple provider entries enable fallback and routing:

```json
{
	"strategy": "priority",
	"fallback": true,
	"auto": true,
	"providers": [
		{
			"id": "brave-search",
			"provider": "brave",
			"apiKey": "<local-only-key>",
			"priority": 10,
			"maxResults": 8
		},
		{
			"id": "exa-search",
			"provider": "exa",
			"apiKey": "<local-only-key>",
			"priority": 10,
			"maxResults": 8
		}
	]
}
```

### Native auto-route

If the active model provider is `openai` or `anthropic`, pi-websearch registers no startup warning and defers to senpi's built-in `openai-web-search` or `anthropic-web-search` extension. Those built-ins wire the provider-native tool directly into supported model requests, so this extension only handles non-native providers and explicit override configs.

When `auto` is `true` (the default) and the active pi model exposes a server-hosted search tool, the extension prepends an implicit `{ id: "native", ... }` entry that reuses the model's resolved API key via `ExtensionContext.modelRegistry.getApiKeyAndHeaders`. The native entry tries first; on failure or when the model does not match, the configured providers handle the search. Disable with `"auto": false` if you want only the explicit `providers` list.

Models that activate native routing (Q1 2026):

- `openai`: any id matching `/^gpt-(4o|4\.1|5)/` that does not contain `codex` — e.g. `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4`, `gpt-5-pro`, `gpt-4.1-mini`, `gpt-4o-mini`; excludes `gpt-5.3-codex` / `gpt-5.3-codex-spark` and non-matching ids such as `gpt-4-turbo` or the o-series.
- `anthropic`: any `claude-*` id (opus/sonnet/haiku/fable, dated or undated).
- `xai`: any `grok-*`.
- `perplexity`: any `sonar*` (search is intrinsic to Sonar models).
- `z-ai` or `zai`: any `glm-*`.
- `kimi-coding`: the `kimi-coding` provider (routes to the Kimi search endpoint).
- `openrouter`: any `<provider>/<model>` whose `<provider>` and `<model>` match one of the rows above (for example `openai/gpt-5.5` or `anthropic/claude-opus-4-7`).

A model that matches but whose endpoint rejects the server-side search tool simply fails that attempt and the configured providers take over (default `fallback: true`).

The native entry inherits `model.baseUrl` from `ExtensionContext.model`, so any local gateway override registered in the pi model registry is honored. The endpoint path is appended automatically: if `baseUrl` already ends with `/v1`, only the resource segment is added; otherwise `/v1/<resource>` is appended.

Routing strategies:

- `priority`: try lower `priority` values first, falling back in order when `fallback` is `true`.
- `round-robin`: rotate the first provider per search; optional `weight` repeats entries in the rotation.
- `fill-first`: collect unique results across providers until the requested result count is filled.

### Progress rendering

While a search is in flight, the TUI shows a single collapsed line for the provider currently being tried — no step counter, just the active source:

```
Searching "q" via duckduckgo-html/backup (max 10)
```

When expanded, a three-state route line is appended so you can see which sources already ran, which one is running, and which are still pending. Each entry is `provider/id` followed by its state: `failed`, the result count, `searching` (the entry at the current attempt index), or `pending`:

```
Searching "q" via duckduckgo-html/backup (max 10)
route exa/primary:failed -> duckduckgo-html/backup:searching -> brave/extra:pending
```

Discovered provider-native entries collapse to `provider/native` (an entry whose id is `native-openai-<fingerprint>` renders as `openai/native`). The finished render keeps the same `provider/id` spelling, e.g. `5 results via duckduckgo-html/backup (priority) in 320ms`, plus a `route ...` line of completed attempt states when expanded.

Supported providers:

- `duckduckgo-html`: DuckDuckGo HTML search endpoint. Requires no `apiKey`; used as the zero-config default.
- `exa`: direct Exa search. Requires `apiKey`.
- `tavily`: direct Tavily search. Requires `apiKey`.
- `brave`: Brave Search API. Requires `apiKey`.
- `serper`: Serper Google search API. Requires `apiKey`.
- `google-cse`: Google Custom Search JSON API. Requires `apiKey` and `searchEngineId`.
- `z-ai`: Z.ai web search endpoint. Requires `apiKey`.
- `openai`: OpenAI Responses API hosted `web_search` tool. Requires `apiKey`.
- `codex`: OpenAI Responses API hosted `web_search` tool. Requires `apiKey`.
- `anthropic`: Anthropic Messages API with server `web_search_20250305` tool. Requires `apiKey`.
- `perplexity`: Perplexity Search API. Requires `apiKey`.
- `xai`: xAI Responses API hosted `web_search` tool. Requires `apiKey`.

Provider-specific optional fields include `id`, `baseUrl`, `model`, `maxResults`, `priority`, `weight`, `searchContextSize`, `codexMode`, `allowedDomains`, `blockedDomains`, and `userLocation` where supported. `baseUrl` is supported for every provider and must be a public HTTPS URL without embedded credentials.

Tool text and TUI output include the selected provider entry, routing strategy, and fallback attempts so the agent can see which provider produced the result.

## Commands

```bash
npm test
npm run typecheck
npm run check
pi -e ./src/index.ts
```

Inside pi, run `/websearch status` to inspect activation state.

## Related

- [senpi](https://github.com/code-yeongyu/senpi) — the fork/runtime these extensions are extracted from.
- [Ultraworkers Discord](https://discord.gg/PUwSMR9XNk) — community link from the senpi README.
- [Dori](https://sisyphuslabs.ai) — the product powered by senpi under the hood.
