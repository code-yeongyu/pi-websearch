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
	it("#given search details #when rendering expanded result #then includes source rows", () => {
		// given
		const details: SearchDetails = {
			provider: "exa",
			entryId: "free-exa",
			query: "pi extensions",
			results: [{ title: "Pi", url: "https://example.com/pi", snippet: "Pi docs" }],
			durationMs: 42,
			truncated: false,
			strategy: "priority",
			attempts: [{ provider: "exa", entryId: "free-exa", durationMs: 42, resultsCount: 1 }],
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
		expect(rendered).toContain("exa/free-exa");
		expect(rendered).toContain("route exa/free-exa:1");
		expect(rendered).toContain("https://example.com/pi");
	});
});
