import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import {
	appendDomainFilters,
	clamp,
	collect,
	contentHeaders,
	getArray,
	getNumber,
	getObject,
	getString,
	result,
} from "./shared.js";

export const deepseekProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		return {
			url: providerUrl(config),
			init: { method: "POST", headers: contentHeaders({ Authorization: `Bearer ${config.apiKey ?? ""}` }) },
			body: {
				query: appendDomainFilters(request.query, allowedDomains, blockedDomains).slice(0, 128),
				count: clamp(maxResults, 1, 50),
			},
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["results"]).map((raw) => {
				const item = getObject(raw);
				const normalized = result(
					getString(item?.["title"]),
					getString(item?.["url"]),
					getString(item?.["summary"]) ?? getString(item?.["snippet"]) ?? getString(item?.["content"]),
					getString(item?.["site_name"]),
					getNumber(item?.["rerank_score"]),
				);
				if (normalized) {
					const date = getString(item?.["date"]);
					if (date) normalized.publishedAt = date;
				}
				return normalized;
			}),
		);
	},
};
