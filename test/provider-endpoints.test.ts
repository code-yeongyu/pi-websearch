import { describe, expect, it } from "vitest";

import { isAllowedProviderBaseUrl } from "../src/websearch/provider-endpoints.js";

describe("provider endpoint safety", () => {
	it("#given localhost names with terminal DNS dots #when validating provider URLs #then rejects private hosts", () => {
		// given
		const privateBaseUrls = ["https://localhost./search", "https://sub.localhost./search"];

		for (const baseUrl of privateBaseUrls) {
			// when
			const allowed = isAllowedProviderBaseUrl(baseUrl);

			// then
			expect(allowed).toBe(false);
		}
	});

	it("#given a public FQDN with a terminal DNS dot #when validating the provider URL #then allows it", () => {
		// given
		const baseUrl = "https://search-gateway.example.com./search";

		// when
		const allowed = isAllowedProviderBaseUrl(baseUrl);

		// then
		expect(allowed).toBe(true);
	});
});
