import { describe, expect, it } from "vitest";

import { renderSearchCall, renderSearchResult } from "../src/websearch/renderers.js";
import type { SearchDetails, SearchProgressDetails } from "../src/websearch/types.js";

const theme = {
	bold: (value: string) => value,
	fg: (_key: string, value: string) => value,
};

describe("renderSearchCall", () => {
	it("#given search args #when rendering call #then includes query and provider hint", () => {
		// given / when
		const component = renderSearchCall({ query: "pi extensions", allowed_domains: ["example.com"] }, theme);

		// then
		expect(component.render(80).join("\n")).toContain("web_search");
		expect(component.render(80).join("\n")).toContain("pi extensions");
	});
});

describe("renderSearchResult", () => {
	it("#given progress details #when rendering partial result #then includes route and result limit", () => {
		// given / when
		const component = renderSearchResult(
			{
				content: [{ type: "text", text: 'Searching "pi extensions" via default/duckduckgo-html (max 10)' }],
				details: {
					phase: "searching",
					query: "pi extensions",
					providerLabels: ["default/duckduckgo-html"],
					maxResults: 10,
				},
			},
			{ isPartial: true },
			theme,
		);

		// then
		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("Searching");
		expect(rendered).toContain("default/duckduckgo-html");
		expect(rendered).toContain("max 10");
	});

	it("#given search details #when rendering expanded result #then includes source rows", () => {
		// given
		const details: SearchDetails = {
			provider: "exa",
			entryId: "exa-search",
			query: "pi extensions",
			results: [{ title: "Pi", url: "https://example.com/pi", snippet: "Pi docs" }],
			durationMs: 42,
			truncated: false,
			strategy: "priority",
			attempts: [{ provider: "exa", entryId: "exa-search", durationMs: 42, resultsCount: 1 }],
		};

		// when
		const component = renderSearchResult(
			{ content: [{ type: "text", text: "ok" }], details },
			{ expanded: true },
			theme,
		);

		// then
		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("1 result");
		expect(rendered).toContain("exa/exa-search");
		expect(rendered).toContain("route exa/exa-search:1");
		expect(rendered).toContain("https://example.com/pi");
	});

	it("#given search details #when rendering collapsed result #then includes top source rows", () => {
		// given
		const details: SearchDetails = {
			provider: "exa",
			entryId: "exa-search",
			query: "pi extensions",
			results: [
				{ title: "Pi", url: "https://example.com/pi", snippet: "Pi docs" },
				{ title: "Extensions", url: "https://example.com/extensions" },
			],
			durationMs: 42,
			truncated: false,
			strategy: "priority",
		};

		// when
		const component = renderSearchResult({ content: [{ type: "text", text: "ok" }], details }, {}, theme);

		// then
		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("2 results");
		expect(rendered).toContain("Pi");
		expect(rendered).toContain("https://example.com/pi");
		expect(rendered).toContain("Pi docs");
	});

	it("#given error details #when rendering result #then displays the error message", () => {
		// given / when
		const component = renderSearchResult(
			{
				content: [{ type: "text", text: "Invalid provider config" }],
				details: { phase: "error", query: "pi extensions", error: "Invalid provider config" },
			},
			{},
			theme,
		);

		// then
		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("Invalid provider config");
	});

	it("#given partial progress with routeLabels #when rendering collapsed #then shows only current provider with no step counter", () => {
		// given
		const details: SearchProgressDetails = {
			phase: "searching",
			query: "route states",
			providerLabels: ["exa/primary", "duckduckgo-html/backup", "brave/extra"],
			routeLabels: ["exa/primary", "duckduckgo-html/backup", "brave/extra"],
			currentProvider: "duckduckgo-html/backup",
			attempts: [{ provider: "exa", entryId: "primary", durationMs: 100, resultsCount: 0, error: "boom" }],
			maxResults: 10,
		};

		// when
		const collapsed = renderSearchResult(
			{ content: [{ type: "text", text: "" }], details },
			{ isPartial: true },
			theme,
		)
			.render(120)
			.join("\n");

		// then
		expect(collapsed.trim()).toBe('Searching "route states" via duckduckgo-html/backup (max 10)');
		expect(collapsed).not.toMatch(/\[\d+\/\d+\]/);
	});

	it("#given partial progress with routeLabels #when rendering expanded #then adds the three-state route line", () => {
		// given
		const details: SearchProgressDetails = {
			phase: "searching",
			query: "route states",
			providerLabels: ["exa/primary", "duckduckgo-html/backup", "brave/extra"],
			routeLabels: ["exa/primary", "duckduckgo-html/backup", "brave/extra"],
			currentProvider: "duckduckgo-html/backup",
			attempts: [{ provider: "exa", entryId: "primary", durationMs: 100, resultsCount: 0, error: "boom" }],
			maxResults: 10,
		};

		// when
		const expanded = renderSearchResult(
			{ content: [{ type: "text", text: "" }], details },
			{ isPartial: true, expanded: true },
			theme,
		)
			.render(120)
			.join("\n");

		// then
		expect(expanded).toContain('Searching "route states" via duckduckgo-html/backup (max 10)');
		expect(expanded).toContain("route exa/primary:failed -> duckduckgo-html/backup:searching -> brave/extra:pending");
		expect(expanded).not.toMatch(/\[\d+\/\d+\]/);
	});
});

describe("renderSearchResult native entry label collapse", () => {
	it("#given finished details with native-openai entryId #when rendering collapsed summary #then collapses to openai/native", () => {
		// given
		const details: SearchDetails = {
			provider: "openai",
			entryId: "native-openai-abc123",
			query: "native label",
			results: [{ title: "Native", url: "https://example.com/native", snippet: "snip" }],
			durationMs: 7,
			truncated: false,
			strategy: "priority",
			attempts: [{ provider: "openai", entryId: "native-openai-abc123", durationMs: 7, resultsCount: 1 }],
		};

		// when
		const rendered = renderSearchResult({ content: [{ type: "text", text: "ok" }], details }, {}, theme)
			.render(120)
			.join("\n");

		// then
		expect(rendered).toContain("via openai/native");
		expect(rendered).not.toContain("native-openai-abc123");
	});

	it("#given finished details with native-openai entryId #when rendering expanded route #then collapses route line to openai/native:count", () => {
		// given
		const details: SearchDetails = {
			provider: "openai",
			entryId: "native-openai-abc123",
			query: "native label",
			results: [{ title: "Native", url: "https://example.com/native", snippet: "snip" }],
			durationMs: 7,
			truncated: false,
			strategy: "priority",
			attempts: [{ provider: "openai", entryId: "native-openai-abc123", durationMs: 7, resultsCount: 1 }],
		};

		// when
		const rendered = renderSearchResult(
			{ content: [{ type: "text", text: "ok" }], details },
			{ expanded: true },
			theme,
		)
			.render(120)
			.join("\n");

		// then
		expect(rendered).toContain("route openai/native:1");
		expect(rendered).not.toContain("native-openai-abc123");
	});
});
