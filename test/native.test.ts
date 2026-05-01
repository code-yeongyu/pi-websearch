import { describe, expect, it } from "vitest";

import { buildNativeEntry, type NativeModelInfo, type NativeModelRegistry } from "../src/websearch/native.js";
import type { SearchProvider } from "../src/websearch/types.js";

function model(provider: string, id: string, baseUrl = "https://gateway.example.com/v1"): NativeModelInfo {
	return { provider, id, baseUrl };
}

function registry(apiKey = "native-test"): NativeModelRegistry {
	return {
		async getApiKeyAndHeaders() {
			return { ok: true, apiKey };
		},
	};
}

describe("buildNativeEntry", () => {
	it("#given supported native model rows #when building entry #then maps provider and endpoint", async () => {
		// given
		const cases: Array<{
			model: NativeModelInfo;
			provider: SearchProvider;
			baseUrl: string;
		}> = [
			{
				model: model("openai", "gpt-5.5-fast"),
				provider: "openai",
				baseUrl: "https://gateway.example.com/v1/responses",
			},
			{
				model: model("openai", "gpt-4o-mini-2026-01-01"),
				provider: "openai",
				baseUrl: "https://gateway.example.com/v1/responses",
			},
			{
				model: model("openai", "gpt-4.1-mini"),
				provider: "openai",
				baseUrl: "https://gateway.example.com/v1/responses",
			},
			{
				model: model("anthropic", "claude-sonnet-4-5-20250929"),
				provider: "anthropic",
				baseUrl: "https://gateway.example.com/v1/messages",
			},
			{
				model: model("anthropic", "claude-opus-4-7", "https://api.anthropic.com"),
				provider: "anthropic",
				baseUrl: "https://api.anthropic.com/v1/messages",
			},
			{
				model: model("anthropic", "claude-opus-4-7", "https://anthropic.gateway.example.com/anthropic"),
				provider: "anthropic",
				baseUrl: "https://anthropic.gateway.example.com/anthropic/v1/messages",
			},
			{
				model: model("xai", "grok-4.3"),
				provider: "xai",
				baseUrl: "https://gateway.example.com/v1/responses",
			},
			{
				model: model("perplexity", "sonar-pro"),
				provider: "perplexity",
				baseUrl: "https://gateway.example.com/v1/chat/completions",
			},
			{
				model: model("z-ai", "glm-4.6"),
				provider: "z-ai",
				baseUrl: "https://gateway.example.com/v1/chat/completions",
			},
			{
				model: model("zai", "glm-4.6"),
				provider: "z-ai",
				baseUrl: "https://gateway.example.com/v1/chat/completions",
			},
		];

		for (const testCase of cases) {
			// when
			const entry = await buildNativeEntry(testCase.model, registry());

			// then
			expect(entry).toEqual({
				id: "native",
				provider: testCase.provider,
				apiKey: "native-test",
				baseUrl: testCase.baseUrl,
				model: testCase.model.id,
				priority: -1,
			});
		}
	});

	it("#given missing auth or unsupported model #when building entry #then returns null", async () => {
		// given
		const noKeyRegistry: NativeModelRegistry = {
			async getApiKeyAndHeaders() {
				return { ok: true };
			},
		};
		const errorRegistry: NativeModelRegistry = {
			async getApiKeyAndHeaders() {
				return { ok: false, error: "missing" };
			},
		};

		// when / then
		expect(await buildNativeEntry(undefined, registry())).toBeNull();
		expect(await buildNativeEntry(model("openai", "gpt-3.5"), registry())).toBeNull();
		expect(await buildNativeEntry(model("custom", "gpt-5.5"), registry())).toBeNull();
		expect(await buildNativeEntry(model("openai", "gpt-5.5"), undefined)).toBeNull();
		expect(await buildNativeEntry(model("openai", "gpt-5.5"), noKeyRegistry)).toBeNull();
		expect(await buildNativeEntry(model("openai", "gpt-5.5"), errorRegistry)).toBeNull();
	});

	it("#given openrouter prefixed model id #when building entry #then resolves via underlying provider", async () => {
		// given
		const cases: Array<{ id: string; provider: SearchProvider; suffix: string }> = [
			{ id: "openai/gpt-5.5", provider: "openai", suffix: "/responses" },
			{ id: "anthropic/claude-opus-4-7", provider: "anthropic", suffix: "/messages" },
			{ id: "xai/grok-4-fast", provider: "xai", suffix: "/responses" },
			{ id: "perplexity/sonar-pro", provider: "perplexity", suffix: "/chat/completions" },
			{ id: "z-ai/glm-4.6", provider: "z-ai", suffix: "/chat/completions" },
		];

		for (const testCase of cases) {
			// when
			const entry = await buildNativeEntry(model("openrouter", testCase.id), registry());

			// then
			expect(entry).toEqual({
				id: "native",
				provider: testCase.provider,
				apiKey: "native-test",
				baseUrl: `https://gateway.example.com/v1${testCase.suffix}`,
				model: testCase.id,
				priority: -1,
			});
		}
	});

	it("#given openrouter id without slash #when building entry #then returns null", async () => {
		// when
		const entry = await buildNativeEntry(model("openrouter", "no-slash"), registry());

		// then
		expect(entry).toBeNull();
	});

	it("#given base url already contains endpoint suffix #when building entry #then does not append twice", async () => {
		// given
		const openaiModel = model("openai", "gpt-5.5", "https://gateway.example.com/v1/responses");
		const anthropicModel = model("anthropic", "claude-opus-4", "https://gateway.example.com/v1/messages");

		// when
		const openaiEntry = await buildNativeEntry(openaiModel, registry());
		const anthropicEntry = await buildNativeEntry(anthropicModel, registry());

		// then
		expect(openaiEntry?.baseUrl).toBe("https://gateway.example.com/v1/responses");
		expect(anthropicEntry?.baseUrl).toBe("https://gateway.example.com/v1/messages");
	});

	it("#given unsafe base url #when building entry #then returns null before resolving auth", async () => {
		// given
		let authCalls = 0;
		const guardedRegistry: NativeModelRegistry = {
			async getApiKeyAndHeaders() {
				authCalls += 1;
				return { ok: true, apiKey: "native-test" };
			},
		};
		const unsafeBaseUrls = [
			"http://127.0.0.1/v1",
			"https://localhost/v1",
			"https://user:pass@gateway.example.com/v1",
			"https://[::1]/v1",
			"https://[fd00::1]/v1",
			"https://[fe80::1]/v1",
			"not-a-url",
		];

		for (const baseUrl of unsafeBaseUrls) {
			// when
			const entry = await buildNativeEntry(model("openai", "gpt-5.5", baseUrl), guardedRegistry);

			// then
			expect(entry).toBeNull();
		}
		expect(authCalls).toBe(0);
	});
});
