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

export const serperProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		const body: JsonObject = {
			q: appendDomainFilters(request.query, allowedDomains, blockedDomains),
			num: clamp(maxResults, 1, 20),
		};
		return {
			url: providerUrl(config),
			init: { method: "POST", headers: contentHeaders({ "X-API-KEY": config.apiKey ?? "" }) },
			body,
		};
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["organic"]).map((raw) => {
				const item = getObject(raw);
				return result(getString(item?.["title"]), getString(item?.["link"]), getString(item?.["snippet"]));
			}),
		);
	},
};
