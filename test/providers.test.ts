import { describe, expect, it } from "vitest";

import { buildSearchRequest, normalizeSearchResponse } from "../src/websearch/providers.js";
import type { SearchProvider, SearchProviderConfig } from "../src/websearch/types.js";

function configFor(provider: SearchProvider): SearchProviderConfig {
	if (provider === "exa") return { provider };
	if (provider === "google-cse") return { provider, apiKey: "google-test", searchEngineId: "cx-test" };
	return { provider, apiKey: `${provider}-test` };
}

describe("buildSearchRequest", () => {
	it("#given base url override for each provider #when building request #then uses configured endpoint", () => {
		// given
		const providers: SearchProvider[] = [
			"exa",
			"tavily",
			"brave",
			"serper",
			"google-cse",
			"z-ai",
			"openai",
			"codex",
			"anthropic",
			"perplexity",
			"xai",
		];

		for (const provider of providers) {
			const config: SearchProviderConfig = {
				...configFor(provider),
				baseUrl: `https://gateway.example.com/${provider}`,
			};

			// when
			const request = buildSearchRequest(config, { query: "override endpoint", maxResults: 4 });

			// then
			expect(request.url.startsWith(`https://gateway.example.com/${provider}`)).toBe(true);
		}
	});

	it("#given exa config without api key #when building request #then uses anonymous exa endpoint", () => {
		// given
		const config: SearchProviderConfig = { provider: "exa" };

		// when
		const request = buildSearchRequest(config, { query: "pi extension", maxResults: 4 });

		// then
		expect(request.url).toBe("https://api.exa.ai/search");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).not.toHaveProperty("x-api-key");
		expect(request.body).toEqual({ query: "pi extension", numResults: 4 });
	});

	it("#given tavily config #when building request #then sends bearer token", () => {
		// given
		const config: SearchProviderConfig = { provider: "tavily", apiKey: "tvly-test" };

		// when
		const request = buildSearchRequest(config, { query: "current docs", maxResults: 5 });

		// then
		expect(request.url).toBe("https://api.tavily.com/search");
		expect(request.init.headers).toHaveProperty("Authorization", "Bearer tvly-test");
		expect(request.body).toEqual({ query: "current docs", max_results: 5 });
	});

	it("#given allowed domain filter #when building brave request #then maps filter into provider query", () => {
		// given
		const config: SearchProviderConfig = { provider: "brave", apiKey: "brave-test" };

		// when
		const request = buildSearchRequest(config, {
			query: "node fetch",
			maxResults: 2,
			allowedDomains: ["nodejs.org"],
		});

		// then
		expect(request.url).toContain("site%3Anodejs.org");
		expect(request.init.headers).toHaveProperty("X-Subscription-Token", "brave-test");
	});

	it("#given config allowlist and request allowlist #when building request #then request narrows config policy", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "exa",
			allowedDomains: ["docs.example.com", "api.example.com"],
		};

		// when
		const request = buildSearchRequest(config, {
			query: "sdk docs",
			maxResults: 3,
			allowedDomains: ["api.example.com", "other.example.com"],
		});

		// then
		expect(request.body).toEqual({ query: "sdk docs", numResults: 3, includeDomains: ["api.example.com"] });
	});

	it("#given config allowlist and request blocklist #when building request #then request narrows config policy", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "exa",
			allowedDomains: ["docs.example.com", "api.example.com"],
		};

		// when
		const request = buildSearchRequest(config, {
			query: "sdk docs",
			maxResults: 3,
			blockedDomains: ["docs.example.com"],
		});

		// then
		expect(request.body).toEqual({ query: "sdk docs", numResults: 3, includeDomains: ["api.example.com"] });
	});

	it("#given config blocklist and request allowlist #when building request #then blocked domains cannot be reintroduced", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "brave",
			apiKey: "brave-test",
			blockedDomains: ["blocked.example.com"],
		};

		// when
		const request = buildSearchRequest(config, {
			query: "node fetch",
			maxResults: 2,
			allowedDomains: ["blocked.example.com", "nodejs.org"],
		});

		// then
		expect(request.url).not.toContain("blocked.example.com");
		expect(request.url).toContain("site%3Anodejs.org");
	});

	it("#given z-ai config #when building request #then uses web search endpoint and bearer token", () => {
		// given
		const config: SearchProviderConfig = { provider: "z-ai", apiKey: "zai-test" };

		// when
		const request = buildSearchRequest(config, { query: "financial news", maxResults: 15 });

		// then
		expect(request.url).toBe("https://api.z.ai/api/paas/v4/web_search");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).toHaveProperty("Authorization", "Bearer zai-test");
		expect(request.body).toEqual({ search_engine: "search-prime", search_query: "financial news", count: 15 });
	});

	it("#given codex config #when building request #then uses hosted web_search tool shape", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "openai",
			apiKey: "openai-test",
			model: "gpt-5.5",
			codexMode: "cached",
			searchContextSize: "high",
		};

		// when
		const request = buildSearchRequest(config, { query: "latest OpenAI web search docs", maxResults: 5 });

		// then
		expect(request.url).toBe("https://api.openai.com/v1/responses");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).toHaveProperty("Authorization", "Bearer openai-test");
		expect(request.body).toEqual({
			model: "gpt-5.5",
			input: "Find web pages matching any of these search terms or quoted phrases. If the query contains OR, search each alternative independently. Return only relevant source URLs, one per line. Query: latest OpenAI web search docs",
			tools: [{ type: "web_search", external_web_access: false, search_context_size: "high" }],
			include: ["web_search_call.action.sources"],
			tool_choice: "required",
		});
	});

	it("#given codex blocklist #when building request #then maps blocked domains into input query", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "codex",
			apiKey: "openai-test",
			blockedDomains: ["spam.example.com"],
		};

		// when
		const request = buildSearchRequest(config, { query: "latest docs", maxResults: 5 });

		// then
		expect(request.body).toEqual({
			model: "gpt-5.5",
			input: "Find web pages matching any of these search terms or quoted phrases. If the query contains OR, search each alternative independently. Return only relevant source URLs, one per line. Query: latest docs -site:spam.example.com",
			tools: [{ type: "web_search", external_web_access: true }],
			include: ["web_search_call.action.sources"],
			tool_choice: "required",
		});
	});

	it("#given perplexity config #when building request #then uses direct search endpoint", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "perplexity",
			apiKey: "pplx-test",
			allowedDomains: ["docs.example.com"],
		};

		// when
		const request = buildSearchRequest(config, { query: "search api docs", maxResults: 25 });

		// then
		expect(request.url).toBe("https://api.perplexity.ai/search");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).toHaveProperty("Authorization", "Bearer pplx-test");
		expect(request.body).toEqual({
			query: "search api docs",
			max_results: 20,
			search_domain_filter: ["docs.example.com"],
		});
	});

	it("#given xai config #when building request #then uses responses web_search tool shape", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "xai",
			apiKey: "xai-test",
			model: "grok-4.3",
			blockedDomains: ["spam.example.com"],
		};

		// when
		const request = buildSearchRequest(config, { query: "current xai docs", maxResults: 5 });

		// then
		expect(request.url).toBe("https://api.x.ai/v1/responses");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).toHaveProperty("Authorization", "Bearer xai-test");
		expect(request.body).toEqual({
			model: "grok-4.3",
			input: "current xai docs",
			tools: [{ type: "web_search", filters: { excluded_domains: ["spam.example.com"] } }],
			tool_choice: "required",
		});
	});

	it("#given anthropic config #when building request #then uses messages web_search tool shape", () => {
		// given
		const config: SearchProviderConfig = {
			provider: "anthropic",
			apiKey: "anthropic-test",
			baseUrl: "https://anthropic.gateway.example.com/anthropic/v1/messages",
			model: "claude-sonnet-4-5-20250929",
			allowedDomains: ["docs.example.com"],
		};

		// when
		const request = buildSearchRequest(config, { query: "current anthropic search docs", maxResults: 5 });

		// then
		expect(request.url).toBe("https://anthropic.gateway.example.com/anthropic/v1/messages");
		expect(request.init.method).toBe("POST");
		expect(request.init.headers).toHaveProperty("x-api-key", "anthropic-test");
		expect(request.init.headers).toHaveProperty("anthropic-version", "2023-06-01");
		expect(request.body).toEqual({
			model: "claude-sonnet-4-5-20250929",
			max_tokens: 1024,
			messages: [{ role: "user", content: "current anthropic search docs" }],
			tools: [
				{ type: "web_search_20250305", name: "web_search", max_uses: 8, allowed_domains: ["docs.example.com"] },
			],
		});
	});
});

describe("normalizeSearchResponse", () => {
	it("#given tavily response #when normalizing #then returns common results", () => {
		// given
		const payload = {
			results: [{ title: "Docs", url: "https://docs.example.com", content: "Useful docs", score: 0.9 }],
			response_time: 1.25,
		};

		// when
		const results = normalizeSearchResponse("tavily", payload);

		// then
		expect(results).toEqual([{ title: "Docs", url: "https://docs.example.com", snippet: "Useful docs", score: 0.9 }]);
	});

	it("#given serper response #when normalizing #then uses organic links", () => {
		// given
		const payload = { organic: [{ title: "Result", link: "https://example.com", snippet: "Snippet", position: 1 }] };

		// when
		const results = normalizeSearchResponse("serper", payload);

		// then
		expect(results).toEqual([{ title: "Result", url: "https://example.com", snippet: "Snippet" }]);
	});

	it("#given z-ai response #when normalizing #then uses search_result links", () => {
		// given
		const payload = {
			search_result: [{ title: "Z Result", link: "https://z.example.com", content: "Z snippet", media: "Example" }],
		};

		// when
		const results = normalizeSearchResponse("z-ai", payload);

		// then
		expect(results).toEqual([
			{ title: "Z Result", url: "https://z.example.com", snippet: "Z snippet", source: "Example" },
		]);
	});

	it("#given codex response #when normalizing #then uses URL citation annotations", () => {
		// given
		const payload = {
			output: [
				{
					type: "message",
					content: [
						{
							type: "output_text",
							text: "Answer with source",
							annotations: [
								{
									type: "url_citation",
									url: "https://openai.com",
									title: "OpenAI",
									start_index: 0,
									end_index: 6,
								},
							],
						},
					],
				},
			],
		};

		// when
		const results = normalizeSearchResponse("codex", payload);

		// then
		expect(results).toEqual([{ title: "OpenAI", url: "https://openai.com", snippet: "Answer with source" }]);
	});

	it("#given openai response with searched URL in text #when normalizing #then extracts source URL", () => {
		// given
		const payload = {
			output: [
				{ type: "web_search_call", status: "completed", action: { type: "search", queries: ["oh my openagent"] } },
				{
					type: "message",
					content: [{ type: "output_text", text: "https://ohmyopenagent.com/", annotations: [] }],
				},
			],
		};

		// when
		const results = normalizeSearchResponse("openai", payload);

		// then
		expect(results).toEqual([
			{
				title: "https://ohmyopenagent.com/",
				url: "https://ohmyopenagent.com/",
				snippet: "https://ohmyopenagent.com/",
			},
		]);
	});

	it("#given perplexity response #when normalizing #then uses result snippets", () => {
		// given
		const payload = {
			results: [
				{ title: "Perplexity", url: "https://docs.perplexity.ai", snippet: "Search docs", date: "2026-01-01" },
			],
		};

		// when
		const results = normalizeSearchResponse("perplexity", payload);

		// then
		expect(results).toEqual([
			{ title: "Perplexity", url: "https://docs.perplexity.ai", snippet: "Search docs", publishedAt: "2026-01-01" },
		]);
	});

	it("#given xai response without annotations #when normalizing #then falls back to citations", () => {
		// given
		const payload = {
			output: [{ type: "message", content: [{ type: "output_text", text: "Answer from Grok", annotations: [] }] }],
			citations: ["https://x.ai"],
		};

		// when
		const results = normalizeSearchResponse("xai", payload);

		// then
		expect(results).toEqual([{ title: "https://x.ai", url: "https://x.ai", snippet: "Answer from Grok" }]);
	});

	it("#given anthropic response #when normalizing #then extracts web search tool results", () => {
		// given
		const payload = {
			content: [
				{ type: "text", text: "Answer with Anthropic source" },
				{
					type: "web_search_tool_result",
					content: [
						{
							type: "web_search_result",
							title: "Anthropic",
							url: "https://docs.anthropic.com",
							page_age: "2026-01-01",
						},
					],
				},
			],
		};

		// when
		const results = normalizeSearchResponse("anthropic", payload);

		// then
		expect(results).toEqual([{ title: "Anthropic", url: "https://docs.anthropic.com", snippet: "2026-01-01" }]);
	});
});
