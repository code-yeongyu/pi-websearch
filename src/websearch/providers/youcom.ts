import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import { clamp, collect, getArray, getObject, getString, result } from "./shared.js";

const KEYED_ENDPOINT = "https://ydc-index.io/v1/search";

export const youcomProvider: ProviderModule = {
	buildRequest({ config, request, maxResults }: BuildContext): BuiltSearchRequest {
		const headers: Record<string, string> = { Accept: "application/json" };
		let baseUrl: string;

		if (config.apiKey) {
			baseUrl = config.baseUrl ?? KEYED_ENDPOINT;
			headers["X-Api-Key"] = config.apiKey;
		} else {
			baseUrl = providerUrl(config);
		}

		const url = new URL(baseUrl);
		url.searchParams.set("query", request.query);
		url.searchParams.set("max_results", String(clamp(maxResults, 1, 20)));
		return {
			url: url.toString(),
			init: { method: "GET", headers },
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		const results = getObject(data["results"]);
		return collect(
			getArray(results?.["web"]).map((raw) => {
				const item = getObject(raw);
				return result(getString(item?.["title"]), getString(item?.["url"]), getString(item?.["description"]));
			}),
		);
	},
};
