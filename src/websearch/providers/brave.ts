import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import { appendDomainFilters, clamp, collect, getArray, getObject, getString, result } from "./shared.js";

export const braveProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		const url = new URL(providerUrl(config));
		url.searchParams.set("q", appendDomainFilters(request.query, allowedDomains, blockedDomains));
		url.searchParams.set("count", String(clamp(maxResults, 1, 20)));
		return {
			url: url.toString(),
			init: { method: "GET", headers: { Accept: "application/json", "X-Subscription-Token": config.apiKey ?? "" } },
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		const web = getObject(data["web"]);
		return collect(
			getArray(web?.["results"]).map((raw) => {
				const item = getObject(raw);
				return result(getString(item?.["title"]), getString(item?.["url"]), getString(item?.["description"]));
			}),
		);
	},
};
