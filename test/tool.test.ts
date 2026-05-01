import { describe, expect, it } from "vitest";

import { web_search } from "../src/websearch/tool.js";

describe("web_search tool definition", () => {
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
});
