import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadWebsearchConfig, validateProviderConfig } from "../src/websearch/config.js";

async function makeTempHome(): Promise<string> {
	const root = join(tmpdir(), `pi-websearch-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	await mkdir(root, { recursive: true });
	return root;
}

describe("loadWebsearchConfig", () => {
	it("#given no config files #when loading config #then reports missing config", async () => {
		// given
		const root = await makeTempHome();

		try {
			// when
			const result = await loadWebsearchConfig({ cwd: root, homeDir: root });

			// then
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("missing_config");
				expect(result.message).toContain(".pi/websearch.json");
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("#given project and global config #when loading config #then project config wins", async () => {
		// given
		const root = await makeTempHome();
		const projectPi = join(root, ".pi");
		const globalPi = join(root, ".pi-home");
		await mkdir(projectPi, { recursive: true });
		await mkdir(globalPi, { recursive: true });
		await writeFile(
			join(projectPi, "websearch.json"),
			JSON.stringify({ provider: "exa", apiKey: "exa-project", maxResults: 3 }),
			"utf8",
		);
		await writeFile(
			join(globalPi, "websearch.json"),
			JSON.stringify({ provider: "tavily", apiKey: "global" }),
			"utf8",
		);

		try {
			// when
			const result = await loadWebsearchConfig({ cwd: root, homeDir: globalPi });

			// then
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.config.strategy).toBe("priority");
				expect(result.config.fallback).toBe(true);
				expect(result.config.providers).toEqual([{ provider: "exa", apiKey: "exa-project", maxResults: 3 }]);
				expect(result.source).toBe(join(projectPi, "websearch.json"));
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("#given multiple providers #when loading config #then preserves routing policy", async () => {
		// given
		const root = await makeTempHome();
		const projectPi = join(root, ".pi");
		await mkdir(projectPi, { recursive: true });
		await writeFile(
			join(projectPi, "websearch.json"),
			JSON.stringify({
				strategy: "round-robin",
				fallback: true,
				providers: [
					{
						id: "anthropic",
						provider: "anthropic",
						apiKey: "anthropic-test",
						baseUrl: "https://anthropic.gateway.example.com/anthropic/v1/messages",
						weight: 2,
					},
					{ id: "exa-search", provider: "exa", apiKey: "exa-test", priority: 10 },
				],
			}),
			"utf8",
		);

		try {
			// when
			const result = await loadWebsearchConfig({ cwd: root, homeDir: root });

			// then
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.config.strategy).toBe("round-robin");
				expect(result.config.providers).toHaveLength(2);
				expect(result.config.providers[0]).toMatchObject({ id: "anthropic", provider: "anthropic", weight: 2 });
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("#given empty provider list #when loading config #then config is invalid", async () => {
		// given
		const root = await makeTempHome();
		const projectPi = join(root, ".pi");
		await mkdir(projectPi, { recursive: true });
		await writeFile(join(projectPi, "websearch.json"), JSON.stringify({ providers: [] }), "utf8");

		try {
			// when
			const result = await loadWebsearchConfig({ cwd: root, homeDir: root });

			// then
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.message).toContain("at least one provider");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("validateProviderConfig", () => {
	it("#given exa without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "exa" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("missing_api_key");
		}
	});

	it("#given exa with api key #when validating #then provider is valid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "exa", apiKey: "exa-test" });

		// then
		expect(result.ok).toBe(true);
	});

	it("#given tavily without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "tavily" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("missing_api_key");
		}
	});

	it("#given google without search engine id #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "google-cse", apiKey: "key" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("searchEngineId");
		}
	});

	it("#given z-ai without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "z-ai" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("missing_api_key");
		}
	});

	it("#given perplexity with api key #when validating #then provider is valid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "perplexity", apiKey: "pplx-test" });

		// then
		expect(result.ok).toBe(true);
	});

	it("#given xai without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "xai" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("missing_api_key");
		}
	});

	it("#given codex without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "codex" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("apiKey");
		}
	});

	it("#given openai without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "openai" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("apiKey");
		}
	});

	it("#given anthropic without api key #when validating #then provider is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "anthropic" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("apiKey");
		}
	});

	it("#given codex command in config file without api key #when loading #then provider is invalid", async () => {
		// given
		const root = await makeTempHome();
		const projectPi = join(root, ".pi");
		await mkdir(projectPi, { recursive: true });
		await writeFile(
			join(projectPi, "websearch.json"),
			JSON.stringify({ provider: "codex", codexCommand: "codex" }),
			"utf8",
		);

		try {
			// when
			const result = await loadWebsearchConfig({ cwd: root, homeDir: root });

			// then
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain("apiKey");
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("#given both config domain filter modes #when validating #then config is invalid", () => {
		// given / when
		const result = validateProviderConfig({
			provider: "brave",
			apiKey: "brave-test",
			allowedDomains: ["docs.example.com"],
			blockedDomains: ["spam.example.com"],
		});

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("invalid_config");
		}
	});

	it("#given unsafe base url #when validating #then config is invalid", () => {
		// given / when
		const result = validateProviderConfig({
			provider: "tavily",
			apiKey: "tvly-test",
			baseUrl: "http://127.0.0.1:8080",
		});

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("invalid_config");
			expect(result.message).toContain("public HTTPS URL");
		}
	});

	it("#given public https base url override #when validating #then config is valid", () => {
		// given / when
		const result = validateProviderConfig({
			provider: "tavily",
			apiKey: "tvly-test",
			baseUrl: "https://search-gateway.example.com/tavily",
		});

		// then
		expect(result.ok).toBe(true);
	});

	it("#given exa with private base url override #when validating #then config is invalid", () => {
		// given / when
		const result = validateProviderConfig({ provider: "exa", baseUrl: "https://localhost/search" });

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("invalid_config");
		}
	});

	it("#given base url with credentials #when validating #then config is invalid", () => {
		// given / when
		const result = validateProviderConfig({
			provider: "tavily",
			apiKey: "tvly-test",
			baseUrl: "https://user:pass@search-gateway.example.com/tavily",
		});

		// then
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("invalid_config");
		}
	});

	it("#given private ipv6 base url override #when validating #then config is invalid", () => {
		// given / when
		const loopback = validateProviderConfig({ provider: "exa", baseUrl: "https://[::1]/search" });
		const uniqueLocal = validateProviderConfig({ provider: "exa", baseUrl: "https://[fd00::1]/search" });
		const linkLocal = validateProviderConfig({ provider: "exa", baseUrl: "https://[fe80::1]/search" });
		const linkLocalUpperRange = validateProviderConfig({ provider: "exa", baseUrl: "https://[febf::1]/search" });
		const mappedLoopback = validateProviderConfig({ provider: "exa", baseUrl: "https://[::ffff:127.0.0.1]/search" });

		// then
		expect(loopback.ok).toBe(false);
		expect(uniqueLocal.ok).toBe(false);
		expect(linkLocal.ok).toBe(false);
		expect(linkLocalUpperRange.ok).toBe(false);
		expect(mappedLoopback.ok).toBe(false);
	});
});
