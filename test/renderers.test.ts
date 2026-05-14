import { describe, expect, it } from "vitest";

import { renderSearchCall, renderSearchResult } from "../src/websearch/renderers.js";
import type { SearchDetails } from "../src/websearch/types.js";

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
});
