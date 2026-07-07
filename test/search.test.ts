import { afterEach, describe, expect, it, vi } from "vitest";

import { createSearchRoutingState, formatSearchText, performSearch } from "../src/websearch/search.js";
import type { WebsearchConfig } from "../src/websearch/types.js";

function jsonResponse(payload: object, status = 200): Response {
	return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("performSearch", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("#given priority providers and fallback enabled #when primary fails #then returns fallback route details", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.includes("primary")) return jsonResponse({ error: "down" }, 503);
			return jsonResponse({
				results: [{ title: "Fallback", url: "https://fallback.example.com", text: "fallback result" }],
			});
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{
					id: "primary",
					provider: "tavily",
					apiKey: "tavily-test",
					baseUrl: "https://gateway.example.com/primary",
					priority: 0,
				},
				{ id: "fallback", provider: "exa", baseUrl: "https://gateway.example.com/fallback", priority: 1 },
			],
		};

		// when
		const details = await performSearch(config, { query: "route test", maxResults: 3 });

		// then
		expect(requestedUrls).toEqual(["https://gateway.example.com/primary", "https://gateway.example.com/fallback"]);
		expect(details.provider).toBe("exa");
		expect(details.entryId).toBe("fallback");
		expect(details.attempts).toEqual([
			{
				provider: "tavily",
				entryId: "primary",
				durationMs: expect.any(Number),
				resultsCount: 0,
				error: "Search failed with HTTP 503: down",
			},
			{ provider: "exa", entryId: "fallback", durationMs: expect.any(Number), resultsCount: 1 },
		]);
		expect(formatSearchText(details)).toContain("Routing attempts: tavily/primary failed");
	});

	it("#given round robin providers #when searching twice #then rotates starting provider", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			const title = url.includes("one") ? "One" : "Two";
			return jsonResponse({ results: [{ title, url: `https://${title.toLowerCase()}.example.com`, text: title }] });
		});
		const config: WebsearchConfig = {
			strategy: "round-robin",
			fallback: false,
			auto: true,
			providers: [
				{ id: "one", provider: "exa", baseUrl: "https://gateway.example.com/one" },
				{ id: "two", provider: "exa", baseUrl: "https://gateway.example.com/two" },
			],
		};
		const state = createSearchRoutingState(config.providers.length);

		// when
		const first = await performSearch(config, { query: "rr", maxResults: 1 }, undefined, state);
		const second = await performSearch(config, { query: "rr", maxResults: 1 }, undefined, state);

		// then
		expect(requestedUrls).toEqual(["https://gateway.example.com/one", "https://gateway.example.com/two"]);
		expect(first.entryId).toBe("one");
		expect(second.entryId).toBe("two");
	});

	it("#given fill first providers #when first provider has insufficient unique results #then aggregates fallback results", async () => {
		// given
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			if (url.includes("one")) {
				return jsonResponse({ results: [{ title: "Shared", url: "https://shared.example.com", text: "first" }] });
			}
			return jsonResponse({
				results: [
					{ title: "Shared duplicate", url: "https://shared.example.com", text: "duplicate" },
					{ title: "Second", url: "https://second.example.com", text: "second" },
				],
			});
		});
		const config: WebsearchConfig = {
			strategy: "fill-first",
			fallback: true,
			auto: true,
			providers: [
				{ id: "one", provider: "exa", baseUrl: "https://gateway.example.com/one" },
				{ id: "two", provider: "exa", baseUrl: "https://gateway.example.com/two" },
			],
		};

		// when
		const details = await performSearch(config, { query: "fill", maxResults: 2 });

		// then
		expect(details.strategy).toBe("fill-first");
		expect(details.results.map((result) => result.url)).toEqual([
			"https://shared.example.com",
			"https://second.example.com",
		]);
		expect(details.attempts?.map((attempt) => attempt.entryId)).toEqual(["one", "two"]);
	});

	it("#given empty results from primary and fallback enabled #when searching #then falls through to next provider", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.includes("primary")) return jsonResponse({ results: [] });
			return jsonResponse({
				results: [{ title: "Fallback", url: "https://fallback.example.com", text: "fallback result" }],
			});
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{ id: "primary", provider: "exa", baseUrl: "https://gateway.example.com/primary", priority: 0 },
				{ id: "fallback", provider: "exa", baseUrl: "https://gateway.example.com/fallback", priority: 1 },
			],
		};

		// when
		const details = await performSearch(config, { query: "empty route", maxResults: 3 });

		// then
		expect(requestedUrls).toEqual(["https://gateway.example.com/primary", "https://gateway.example.com/fallback"]);
		expect(details.entryId).toBe("fallback");
		expect(details.results).toHaveLength(1);
		expect(details.attempts?.[0]).toMatchObject({ entryId: "primary", resultsCount: 0 });
		expect(details.attempts?.[0]?.error).toContain("no results");
	});

	it("#given empty results everywhere #when fallback enabled #then reports aggregate failure", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => jsonResponse({ results: [] }));
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{ id: "one", provider: "exa", baseUrl: "https://gateway.example.com/one" },
				{ id: "two", provider: "exa", baseUrl: "https://gateway.example.com/two" },
			],
		};

		// when
		const details = await performSearch(config, { query: "nothing", maxResults: 2 });

		// then
		expect(details.results).toHaveLength(0);
		expect(details.error).toContain("All configured search providers failed");
		expect(details.error).toContain("exa/one");
		expect(details.error).toContain("exa/two");
	});

	it("#given empty results and fallback disabled #when searching #then surfaces no-results error", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => jsonResponse({ results: [] }));
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [{ id: "only", provider: "exa", baseUrl: "https://gateway.example.com/only" }],
		};

		// when
		const details = await performSearch(config, { query: "nothing", maxResults: 2 });

		// then
		expect(details.results).toHaveLength(0);
		expect(details.error).toContain("no results");
	});

	it("#given hanging provider with timeoutMs #when searching #then times out and falls through", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.includes("hang")) {
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
				});
			}
			return Promise.resolve(
				jsonResponse({ results: [{ title: "Quick", url: "https://quick.example.com", text: "quick" }] }),
			);
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{ id: "hang", provider: "exa", baseUrl: "https://gateway.example.com/hang", timeoutMs: 50 },
				{ id: "quick", provider: "exa", baseUrl: "https://gateway.example.com/quick" },
			],
		};

		// when
		const details = await performSearch(config, { query: "timeout route", maxResults: 1 });

		// then
		expect(requestedUrls).toEqual(["https://gateway.example.com/hang", "https://gateway.example.com/quick"]);
		expect(details.entryId).toBe("quick");
		expect(details.attempts?.[0]?.error).toMatch(/timed out after 50ms/);
	});

	it("#given user abort mid-request #when aborted #then rethrows abort without trying next provider", async () => {
		// given
		const controller = new AbortController();
		let fetchCalls = 0;
		vi.stubGlobal("fetch", (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			fetchCalls += 1;
			queueMicrotask(() => controller.abort());
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			});
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{ id: "one", provider: "exa", baseUrl: "https://gateway.example.com/one" },
				{ id: "two", provider: "exa", baseUrl: "https://gateway.example.com/two" },
			],
		};

		// when / then
		await expect(
			performSearch(config, { query: "abort route", maxResults: 1 }, controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchCalls).toBe(1);
	});

	it("#given http error with nested error message #when fetch fails #then surfaces the message", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return jsonResponse({ error: { message: "max_tokens must be at least 1024" } }, 400);
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [
				{ id: "primary", provider: "exa", apiKey: "exa-test", baseUrl: "https://gateway.example.com/exa" },
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toContain("HTTP 400");
		expect(details.error).toContain("max_tokens must be at least 1024");
	});

	it("#given http error with top-level error string #when fetch fails #then surfaces the error string", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return jsonResponse({ error: "Bad Request" }, 400);
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [
				{ id: "primary", provider: "exa", apiKey: "exa-test", baseUrl: "https://gateway.example.com/exa" },
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toContain("HTTP 400");
		expect(details.error).toContain("Bad Request");
	});

	it("#given http error with non-json body #when fetch fails #then surfaces the raw body", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return new Response("error code: 530", { status: 530, headers: { "Content-Type": "text/plain" } });
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [
				{
					id: "primary",
					provider: "openai",
					apiKey: "openai-test",
					baseUrl: "https://gateway.example.com/v1/responses",
					model: "gpt-5.5",
				},
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toContain("HTTP 530");
		expect(details.error).toContain("error code: 530");
	});

	it("#given http error with empty body #when fetch fails #then keeps a minimal error", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => new Response("", { status: 502 }));
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [
				{ id: "primary", provider: "exa", apiKey: "exa-test", baseUrl: "https://gateway.example.com/exa" },
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toBe("Search failed with HTTP 502");
	});

	it("#given http error with very long body #when fetch fails #then truncates body in error", async () => {
		// given
		const longMessage = "x".repeat(2000);
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return jsonResponse({ error: { message: longMessage } }, 400);
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: false,
			auto: true,
			providers: [
				{ id: "primary", provider: "exa", apiKey: "exa-test", baseUrl: "https://gateway.example.com/exa" },
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toContain("HTTP 400");
		expect((details.error ?? "").length).toBeLessThan(700);
		expect(details.error).toContain("…");
	});

	it("#given fallback chain all fail with bodies #when aggregating #then per-attempt details surface", async () => {
		// given
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			if (url.includes("messages")) {
				return jsonResponse({ error: { message: "model not supported" } }, 400);
			}
			return new Response("origin unreachable", { status: 530, headers: { "Content-Type": "text/plain" } });
		});
		const config: WebsearchConfig = {
			strategy: "priority",
			fallback: true,
			auto: true,
			providers: [
				{
					id: "native",
					provider: "anthropic",
					apiKey: "anthropic-test",
					baseUrl: "https://gateway.example.com/v1/messages",
				},
				{
					id: "openai-search",
					provider: "openai",
					apiKey: "openai-test",
					baseUrl: "https://gateway.example.com/v1/responses",
					model: "gpt-5.5",
				},
			],
		};

		// when
		const details = await performSearch(config, { query: "test", maxResults: 1 });

		// then
		expect(details.error).toContain("anthropic/native");
		expect(details.error).toContain("HTTP 400");
		expect(details.error).toContain("model not supported");
		expect(details.error).toContain("openai/openai-search");
		expect(details.error).toContain("HTTP 530");
		expect(details.error).toContain("origin unreachable");
	});
});
