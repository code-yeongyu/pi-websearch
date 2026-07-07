import { providerUrl } from "../provider-endpoints.js";
import type { BuiltSearchRequest, JsonObject, SearchResultItem } from "../types.js";
import type { BuildContext, ProviderModule } from "./shared.js";
import { clamp, collect, contentHeaders, getArray, getNumber, getObject, getString, result } from "./shared.js";

export const exaProvider: ProviderModule = {
	buildRequest({ config, request, maxResults, allowedDomains, blockedDomains }: BuildContext): BuiltSearchRequest {
		const headers = contentHeaders({ "x-api-key": config.apiKey ?? "" });
		const body: JsonObject = { query: request.query, numResults: clamp(maxResults, 1, 20) };
		if (allowedDomains) body["includeDomains"] = allowedDomains;
		if (blockedDomains) body["excludeDomains"] = blockedDomains;
		return { url: providerUrl(config), init: { method: "POST", headers }, body };
	},
	normalizeResponse(data: JsonObject): SearchResultItem[] {
		return collect(
			getArray(data["results"]).map((raw) => {
				const item = getObject(raw);
				return result(
					getString(item?.["title"]),
					getString(item?.["url"]),
					getString(item?.["text"]) ?? getString(item?.["snippet"]),
					undefined,
					getNumber(item?.["score"]),
				);
			}),
		);
	},
};
