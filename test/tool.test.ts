import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeModelInfo, NativeModelRegistry } from "../src/websearch/native.js";
import { createWebSearchTool, web_search } from "../src/websearch/tool.js";
import type {
	SearchDetails,
	SearchErrorDetails,
	SearchProviderEntry,
	WebsearchConfig,
} from "../src/websearch/types.js";

function jsonResponse(payload: object, status = 200): Response {
	return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function config(auto: boolean, maxResults?: number): WebsearchConfig {
	const provider: SearchProviderEntry = {
		id: "manual",
		provider: "exa",
		apiKey: "exa-test",
		baseUrl: "https://gateway.example.com/exa",
	};
	return {
		strategy: "priority",
		fallback: true,
		auto,
		providers: [maxResults === undefined ? provider : { ...provider, maxResults }],
	};
}

function context(model: NativeModelInfo) {
	const modelRegistry: NativeModelRegistry = {
		async getApiKeyAndHeaders() {
			return { ok: true, apiKey: "native-test" };
		},
	};
	return { model, modelRegistry };
}

type NativeExecutionContext = ReturnType<typeof context>;
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
		ctx: NativeExecutionContext,
	): ReturnType<typeof web_search.execute>;
};

function withNativeExecutionContext(tool: ReturnType<typeof createWebSearchTool>): NativeExecutable {
	return tool as NativeExecutable;
}

describe("web_search tool definition", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("#given web search tool #when inspecting metadata #then exposes expected name and label", () => {
		// given / when / then
		expect(web_search.name).toBe("web_search");
		expect(web_search.label).toBe("Web Search");
		expect(web_search.description).toContain("Search the web");
	});

	it("#given web search parameters #when inspecting schema #then matches free-code shape", () => {
		// given
		const parameters = web_search.parameters;

		// when / then
		expect(parameters.required).toEqual(["query"]);
		expect(parameters.properties).toHaveProperty("query");
		expect(parameters.properties).toHaveProperty("allowed_domains");
		expect(parameters.properties).toHaveProperty("blocked_domains");
		expect(parameters.properties).not.toHaveProperty("maxResults");
		expect(parameters.additionalProperties).toBe(false);
	});

	it("#given auto enabled and matching active model #when executing #then prepends native provider", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			return jsonResponse({
				output: [
					{
						type: "web_search_call",
						action: { sources: [{ url: "https://native.example.com" }] },
					},
				],
			});
		});
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(true), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "native route" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchDetails;
		expect(requestedUrls).toEqual(["https://gateway.example.com/v1/responses"]);
		expect(details.provider).toBe("openai");
		expect(details.entryId).toBe("native");
		expect(details.attempts?.map((attempt) => attempt.entryId)).toEqual(["native"]);
	});

	it("#given native route and configured max results #when executing #then preserves configured limit", async () => {
		// given
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return jsonResponse({
				output: [
					{
						type: "web_search_call",
						action: {
							sources: [
								{ url: "https://one.example.com" },
								{ url: "https://two.example.com" },
								{ url: "https://three.example.com" },
							],
						},
					},
				],
			});
		});
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(true, 2), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "native route" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchDetails;
		expect(details.entryId).toBe("native");
		expect(details.results.map((item) => item.url)).toEqual(["https://one.example.com", "https://two.example.com"]);
	});

	it("#given auto disabled and matching active model #when executing #then does not prepend native provider", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			return jsonResponse({ results: [{ title: "Manual", url: "https://manual.example.com", text: "manual" }] });
		});
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(false), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "manual route" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchDetails;
		expect(requestedUrls).toEqual(["https://gateway.example.com/exa"]);
		expect(details.provider).toBe("exa");
		expect(details.entryId).toBe("manual");
	});

	it("#given configured provider #when execution starts #then emits route progress details for the TUI", async () => {
		// given
		const updates: Array<{ content: Array<{ type: string; text?: string }>; details?: unknown }> = [];
		vi.stubGlobal("fetch", async (): Promise<Response> => {
			return jsonResponse({ results: [{ title: "Manual", url: "https://manual.example.com", text: "manual" }] });
		});
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(false, 4), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "route progress" },
			undefined,
			(update) => updates.push(update),
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchDetails;
		expect(details.provider).toBe("exa");
		expect(updates[0]).toMatchObject({
			content: [{ type: "text", text: 'Searching "route progress" via manual/exa (max 4)' }],
			details: {
				phase: "searching",
				query: "route progress",
				providerLabels: ["manual/exa"],
				maxResults: 4,
			},
		});
	});

	it("#given invalid domain filters #when executing #then returns error details without spoofing a provider", async () => {
		// given
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(false), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "bad filters", allowed_domains: ["example.com"], blocked_domains: ["example.org"] },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchErrorDetails;
		expect(details).toEqual({
			phase: "error",
			query: "bad filters",
			error: "Error: Cannot specify both allowed_domains and blocked_domains in the same request",
		});
		expect("provider" in details).toBe(false);
	});

	it("#given config load failure #when executing #then returns load error details without provider attribution", async () => {
		// given
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({
				ok: false,
				reason: "invalid_config",
				message: "Invalid provider config in .pi/websearch.json",
			})),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "config failure" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-5.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchErrorDetails;
		expect(details).toEqual({
			phase: "error",
			query: "config failure",
			error: "Invalid provider config in .pi/websearch.json",
			reason: "invalid_config",
		});
		expect("provider" in details).toBe(false);
	});

	it("#given auto enabled and unsupported active model #when executing #then does not prepend native provider", async () => {
		// given
		const requestedUrls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
			const url = String(input);
			requestedUrls.push(url);
			return jsonResponse({ results: [{ title: "Manual", url: "https://manual.example.com", text: "manual" }] });
		});
		const tool = withNativeExecutionContext(
			createWebSearchTool(() => ({ ok: true, config: config(true), source: "test" })),
		);

		// when
		const result = await tool.execute(
			"tool-call",
			{ query: "manual route" },
			undefined,
			undefined,
			context({ provider: "openai", id: "gpt-3.5", baseUrl: "https://gateway.example.com/v1" }),
		);

		// then
		const details = result.details as SearchDetails;
		expect(requestedUrls).toEqual(["https://gateway.example.com/exa"]);
		expect(details.provider).toBe("exa");
		expect(details.entryId).toBe("manual");
	});
});
