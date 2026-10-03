import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import { appendDomainFilters, clamp, collect, getArray, getObject, getString, result } from "./shared.js";

const WEB_URL = /^https?:\/\//i;

export const serplyProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		const url = new URL(providerUrl(config));
		url.searchParams.set("q", appendDomainFilters(request.query, allowedDomains, blockedDomains));
		url.searchParams.set("num", String(clamp(maxResults, 1, 10)));
		return {
			url: url.toString(),
			init: {
				method: "GET",
				headers: { Accept: "application/json", "User-Agent": "pi-websearch", "X-Api-Key": config.apiKey ?? "" },
			},
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["results"]).map((raw) => {
				const item = getObject(raw);
				const link = getString(item?.["link"]);
				return result(
					getString(item?.["title"]),
					link && WEB_URL.test(link) ? link : undefined,
					getString(item?.["description"]),
				);
			}),
		);
	},
};
