import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import {
	appendDomainFilters,
	clamp,
	collect,
	contentHeaders,
	getArray,
	getObject,
	getString,
	result,
} from "./shared.js";

export const kimiProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		return {
			url: providerUrl(config),
			init: { method: "POST", headers: contentHeaders({ Authorization: `Bearer ${config.apiKey ?? ""}` }) },
			body: {
				text_query: appendDomainFilters(request.query, allowedDomains, blockedDomains),
				limit: clamp(maxResults, 1, 20),
				enable_page_crawling: false,
				timeout_seconds: 30,
			},
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["search_results"]).map((raw) => {
				const item = getObject(raw);
				return result(
					getString(item?.["title"]),
					getString(item?.["url"]),
					getString(item?.["summary"]) ?? getString(item?.["content"]),
				);
			}),
		);
	},
};
