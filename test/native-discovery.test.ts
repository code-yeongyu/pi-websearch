import { afterEach, describe, expect, it, vi } from "vitest";

import { buildNativeEntries, type NativeModelInfo, type NativeModelRegistry } from "../src/websearch/native.js";
import { createWebSearchTool } from "../src/websearch/tool.js";
import type { SearchDetails, WebsearchConfig } from "../src/websearch/types.js";

type DiscoveryRegistry = NativeModelRegistry & {
	getAvailable(): NativeModelInfo[];
};

type NativeExecutionContext = {
	model: NativeModelInfo;
	modelRegistry: DiscoveryRegistry;
};

type ToolUpdate = {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
};

type NativeExecutable = {
	execute(
		toolCallId: string,
		params: { query: string; allowed_domains?: string[]; blocked_domains?: string[] },
		signal: AbortSignal | undefined,
		onUpdate: ((update: ToolUpdate) => void) | undefined,
		ctx: unknown,
	): Promise<{ details?: unknown }>;
};

function jsonResponse(payload: object, status = 200): Response {
	return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function config(auto: boolean): WebsearchConfig {
	return {
		strategy: "priority",
		fallback: true,
		auto,
		providers: [
			{
				id: "manual",
				provider: "exa",
				apiKey: "exa-test",
				baseUrl: "https://gateway.example.com/exa",
			},
		],
	};
}

function context(model: NativeModelInfo, modelRegistry: DiscoveryRegistry): NativeExecutionContext {
	return { model, modelRegistry };
}

function toolWithContext(tool: ReturnType<typeof createWebSearchTool>): NativeExecutable {
	return tool as NativeExecutable;
}

function registry(available: NativeModelInfo[]): DiscoveryRegistry {
	return {
		async getApiKeyAndHeaders() {
			return { ok: true, apiKey: "native-test" };
		},
		getAvailable() {
			return available;
		},
	};
}

function anthropicAliases(baseUrl: string): NativeModelInfo[] {
	return Array.from({ length: 8 }, (_value, index) => ({
		provider: "anthropic",
		id: index === 0 ? "claude-opus-4" : `claude-opus-4-${index}`,
		baseUrl,
	}));
}

function zAiAliases(baseUrl: string): NativeModelInfo[] {
	return Array.from({ length: 6 }, (_value, index) => ({
		provider: "z-ai",
		id: `glm-4.6-${index}`,
		baseUrl,
	}));
}

describe("native discovery routing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("#given an unsupported active model and discovered native aliases #when executing web_search #then dedupes to one route per provider endpoint before manual fallback", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.endsWith("/messages") || url.endsWith("/chat/completions")) {
				return new Response(JSON.stringify({ error: "native failed" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
			return jsonResponse({ results: [{ title: "Manual", url: "https://manual.example.com", text: "manual" }] });
		});
		const tool = toolWithContext(createWebSearchTool(() => ({ ok: true, config: config(true), source: "test" })));
		const modelRegistry = registry([
			...anthropicAliases("https://gateway.example.com/v1"),
			...zAiAliases("https://gateway.example.com/v1"),
		]);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "discovery cascade" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-3.5", baseUrl: "https://gateway.example.com/v1" }, modelRegistry),
		);

		// then
		const details = result.details as SearchDetails;
		expect(requestedUrls).toEqual([
			"https://gateway.example.com/v1/messages",
			"https://gateway.example.com/v1/chat/completions",
			"https://gateway.example.com/exa",
		]);
		expect(details.provider).toBe("exa");
		expect(details.entryId).toBe("manual");
		expect(details.attempts?.map((attempt) => attempt.entryId)).toEqual([
			"native-anthropic-b9f0e3d4ac1da541",
			"native-z-ai-97ac6bcbbc83556b",
			"manual",
		]);
	});

	it("#given an active native model and duplicate discovered aliases #when executing web_search #then keeps the active route first and drops same-route aliases", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.endsWith("/responses") || url.endsWith("/messages")) {
				return new Response(JSON.stringify({ error: "native failed" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
			return jsonResponse({ results: [{ title: "Manual", url: "https://manual.example.com", text: "manual" }] });
		});
		const tool = toolWithContext(createWebSearchTool(() => ({ ok: true, config: config(true), source: "test" })));
		const modelRegistry = registry([
			{ provider: "openai", id: "gpt-4o-mini-2026-01-01", baseUrl: "https://gateway.example.com/v1" },
			{ provider: "openai", id: "gpt-4.1-mini", baseUrl: "https://gateway.example.com/v1" },
			{ provider: "anthropic", id: "claude-sonnet-4-5-20250929", baseUrl: "https://gateway.example.com/v1" },
		]);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "active route" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }, modelRegistry),
		);

		// then
		const details = result.details as SearchDetails;
		expect(requestedUrls).toEqual([
			"https://gateway.example.com/v1/responses",
			"https://gateway.example.com/v1/messages",
			"https://gateway.example.com/exa",
		]);
		expect(details.provider).toBe("exa");
		expect(details.entryId).toBe("manual");
		expect(details.attempts?.map((attempt) => attempt.entryId)).toEqual([
			"native",
			"native-anthropic-b9f0e3d4ac1da541",
			"manual",
		]);
	});

	it("#given unavailable aliases on the same route #when discovering native entries #then resolves auth for only one candidate", async () => {
		// given
		const authModels: string[] = [];
		const modelRegistry: DiscoveryRegistry = {
			async getApiKeyAndHeaders(model) {
				authModels.push(model.id);
				return { ok: false, error: "unavailable" };
			},
			getAvailable() {
				return anthropicAliases("https://gateway.example.com/v1");
			},
		};

		// when
		const entries = await buildNativeEntries(undefined, modelRegistry);

		// then
		expect(entries).toEqual([]);
		expect(authModels).toEqual(["claude-opus-4"]);
	});

	it("#given credential-like endpoint path material #when discovering a route #then emits an opaque stable id", async () => {
		// given
		const modelRegistry = registry([
			{
				provider: "openai",
				id: "gpt-5.5",
				baseUrl: "https://gateway.example.com/proxy/sk-live-1234/v1",
			},
		]);

		// when
		const entries = await buildNativeEntries(undefined, modelRegistry);

		// then
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toMatch(/^native-openai-[0-9a-f]{16}$/);
		expect(entries[0]?.id).not.toContain("sk-live-1234");
	});

	it("#given equivalent endpoint spellings #when discovering aliases #then canonicalizes them to one route", async () => {
		// given
		const authModels: string[] = [];
		const modelRegistry: DiscoveryRegistry = {
			async getApiKeyAndHeaders(model) {
				authModels.push(model.id);
				return { ok: true, apiKey: "native-test" };
			},
			getAvailable() {
				return [
					{ provider: "openai", id: "gpt-5.5", baseUrl: "https://GATEWAY.example.com:443/v1" },
					{ provider: "openai", id: "gpt-4.1", baseUrl: "https://gateway.example.com/v1" },
				];
			},
		};

		// when
		const entries = await buildNativeEntries(undefined, modelRegistry);

		// then
		expect(entries).toHaveLength(1);
		expect(authModels).toEqual(["gpt-5.5"]);
	});
});
