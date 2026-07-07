import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import { appendDomainFilters, clamp, collect, getArray, getObject, getString, result } from "./shared.js";

export const googleCseProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		const url = new URL(providerUrl(config));
		url.searchParams.set("q", appendDomainFilters(request.query, allowedDomains, blockedDomains));
		url.searchParams.set("key", config.apiKey ?? "");
		url.searchParams.set("cx", config.searchEngineId ?? "");
		url.searchParams.set("num", String(clamp(maxResults, 1, 10)));
		return { url: url.toString(), init: { method: "GET", headers: { Accept: "application/json" } } };
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["items"]).map((raw) => {
				const item = getObject(raw);
				return result(getString(item?.["title"]), getString(item?.["link"]), getString(item?.["snippet"]));
			}),
		);
	},
};
