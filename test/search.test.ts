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
				error: "Search failed with HTTP 503",
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
});
