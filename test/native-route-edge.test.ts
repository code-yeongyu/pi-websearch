import { describe, expect, it } from "vitest";

import { buildNativeEntries, type NativeModelInfo, type NativeModelRegistry } from "../src/websearch/native.js";

type DiscoveryRegistry = NativeModelRegistry & {
	getAvailable(): NativeModelInfo[];
};

describe("native route edge cases", () => {
	it("#given active route auth fails #when a discovered alias shares the route #then does not retry auth through the alias", async () => {
		// given
		const activeModel: NativeModelInfo = {
			provider: "openai",
			id: "gpt-5.5",
			baseUrl: "https://gateway.example.com/v1",
		};
		const authModels: string[] = [];
		const modelRegistry: DiscoveryRegistry = {
			async getApiKeyAndHeaders(model) {
				authModels.push(model.id);
				return model.id === activeModel.id
					? { ok: false, error: "active unavailable" }
					: { ok: true, apiKey: "alias-key" };
			},
			getAvailable() {
				return [{ provider: "openai", id: "gpt-4.1", baseUrl: "https://gateway.example.com/v1" }];
			},
		};

		// when
		const entries = await buildNativeEntries(activeModel, modelRegistry);

		// then
		expect(entries).toEqual([]);
		expect(authModels).toEqual(["gpt-5.5"]);
	});

	it("#given query auth and fragment aliases #when building the endpoint #then preserves query and dedupes fragments", async () => {
		// given
		const authModels: string[] = [];
		const modelRegistry: DiscoveryRegistry = {
			async getApiKeyAndHeaders(model) {
				authModels.push(model.id);
				return { ok: true, apiKey: "native-test" };
			},
			getAvailable() {
				return [
					{
						provider: "openai",
						id: "gpt-5.5",
						baseUrl: "https://gateway.example.com/v1?token=secret#first",
					},
					{
						provider: "openai",
						id: "gpt-4.1",
						baseUrl: "https://gateway.example.com/v1?token=secret#second",
					},
				];
			},
		};

		// when
		const entries = await buildNativeEntries(undefined, modelRegistry);

		// then
		expect(entries).toHaveLength(1);
		expect(entries[0]?.baseUrl).toBe("https://gateway.example.com/v1/responses?token=secret");
		expect(entries[0]?.id).toMatch(/^native-openai-[0-9a-f]{16}$/);
		expect(entries[0]?.id).not.toContain("secret");
		expect(authModels).toEqual(["gpt-5.5"]);
	});
});
