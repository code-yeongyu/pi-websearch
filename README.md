# pi-websearch

Provider-backed `web_search` tool for pi. Activation is explicit: if no config is found, the extension stays inactive and surfaces a TUI startup error.

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

Example:

```json
{
	"provider": "perplexity",
	"apiKey": "pplx-...",
	"maxResults": 8,
	"allowedDomains": ["docs.example.com"]
}
```

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

When `auto` is `true` (the default) and the active pi model exposes a server-hosted search tool, the extension prepends an implicit `{ id: "native", ... }` entry that reuses the model's resolved API key via `ExtensionContext.modelRegistry.getApiKeyAndHeaders`. The native entry tries first; on failure or when the model does not match, the configured providers handle the search. Disable with `"auto": false` if you want only the explicit `providers` list.

Models that activate native routing (Q1 2026):

- `openai`: `gpt-5.5`, `gpt-5.5-fast`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini` (excludes `gpt-4.1-nano`, `gpt-5-codex`, `gpt-5.1-codex`).
- `anthropic`: `claude-opus-4-*`, `claude-sonnet-4-*`.
- `xai`: any `grok-*`.
- `perplexity`: any `sonar*` (search is intrinsic to Sonar models).
- `z-ai` or `zai`: any `glm-*`.
- `openrouter`: any `<provider>/<model>` whose `<provider>` and `<model>` match one of the rows above (for example `openai/gpt-5.5` or `anthropic/claude-opus-4-7`).

The native entry inherits `model.baseUrl` from `ExtensionContext.model`, so any local gateway override registered in the pi model registry is honored. The endpoint path is appended automatically: if `baseUrl` already ends with `/v1`, only the resource segment is added; otherwise `/v1/<resource>` is appended.

Routing strategies:

- `priority`: try lower `priority` values first, falling back in order when `fallback` is `true`.
- `round-robin`: rotate the first provider per search; optional `weight` repeats entries in the rotation.
- `fill-first`: collect unique results across providers until the requested result count is filled.

Supported providers:

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
