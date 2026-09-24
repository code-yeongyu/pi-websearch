import { defineTool, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { buildNativeEntries, type NativeModelInfo, type NativeModelRegistry } from "./native.js";
import { renderSearchCall, renderSearchResult } from "./renderers.js";
import {
	createSearchRoutingState,
	formatSearchText,
	performSearch,
	providerEntryLabel,
	type SearchRoutingState,
} from "./search.js";
import type {
	ConfigLoadResult,
	SearchErrorDetails,
	SearchProgressDetails,
	SearchRenderDetails,
	WebsearchConfig,
} from "./types.js";

const Params = Type.Object(
	{
		query: Type.String({ minLength: 2, description: "The search query to use" }),
		allowed_domains: Type.Optional(
			Type.Array(Type.String(), { description: "Only include search results from these domains" }),
		),
		blocked_domains: Type.Optional(
			Type.Array(Type.String(), { description: "Never include search results from these domains" }),
		),
	},
	{ additionalProperties: false },
);

export type ConfigProvider = () => ConfigLoadResult;
type WebSearchTool = ReturnType<typeof defineTool<typeof Params, SearchRenderDetails>>;

function nativeModelFromContext(model: ExtensionContext["model"]): NativeModelInfo | undefined {
	if (!model) return undefined;
	return { provider: model.provider, id: model.id, baseUrl: model.baseUrl };
}

function nativeRegistryFromContext(modelRegistry: ExtensionContext["modelRegistry"]): NativeModelRegistry {
	return {
		async getApiKeyAndHeaders(model) {
			return modelRegistry.getApiKeyAndHeaders(model as Parameters<typeof modelRegistry.getApiKeyAndHeaders>[0]);
		},
		getAvailable() {
			return modelRegistry.getAvailable().map((available) => ({
				provider: available.provider,
				id: available.id,
				baseUrl: available.baseUrl,
			}));
		},
	};
}

async function configWithNativeRoute(config: WebsearchConfig, ctx: ExtensionContext): Promise<WebsearchConfig> {
	if (!config.auto) return config;
	const nativeEntries = await buildNativeEntries(
		nativeModelFromContext(ctx.model),
		nativeRegistryFromContext(ctx.modelRegistry),
	);
	return nativeEntries.length > 0 ? { ...config, providers: [...nativeEntries, ...config.providers] } : config;
}

function formatSearchProgressText(details: SearchProgressDetails): string {
	if (details.currentProvider) {
		return `Searching "${details.query}" via ${details.currentProvider} (max ${details.maxResults})`;
	}
	const route = details.providerLabels.length > 0 ? details.providerLabels.join(" -> ") : "configured providers";
	return `Searching "${details.query}" via ${route} (max ${details.maxResults})`;
}

function searchErrorDetails(query: string, error: string, reason?: SearchErrorDetails["reason"]): SearchErrorDetails {
	return { phase: "error", query, error, ...(reason ? { reason } : {}) };
}

export function createWebSearchTool(getConfig: ConfigProvider): WebSearchTool {
	let routingState: SearchRoutingState | undefined;
	let routingKey = "";

	return defineTool<typeof Params, SearchRenderDetails>({
		name: "web_search",
		label: "Web Search",
		description: "Search the web for current information and return source URLs for citation.",
		promptSnippet: "Search the web for current information, documentation, news, or external facts.",
		promptGuidelines: ["After using web_search, cite relevant returned URLs in the final answer."],
		parameters: Params,
		async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			if (params.allowed_domains?.length && params.blocked_domains?.length) {
				const message = "Error: Cannot specify both allowed_domains and blocked_domains in the same request";
				const details = searchErrorDetails(params.query, message);
				return { content: [{ type: "text", text: message }], details };
			}

			const loaded = getConfig();
			if (!loaded.ok) {
				const details = searchErrorDetails(params.query, loaded.message, loaded.reason);
				return { content: [{ type: "text", text: loaded.message }], details };
			}

			const maxResults = loaded.config.providers[0]?.maxResults ?? 10;
			const config = await configWithNativeRoute(loaded.config, ctx);
			const progressDetails: SearchProgressDetails = {
				phase: "searching",
				query: params.query,
				providerLabels: config.providers.map(providerEntryLabel),
				maxResults,
				strategy: config.strategy,
				...(params.allowed_domains ? { allowedDomains: params.allowed_domains } : {}),
				...(params.blocked_domains ? { blockedDomains: params.blocked_domains } : {}),
			};
			onUpdate?.({
				content: [{ type: "text", text: formatSearchProgressText(progressDetails) }],
				details: progressDetails,
			});

			const nextRoutingKey = `${config.strategy}:${config.providers.map((provider) => provider.id ?? provider.provider).join("|")}`;
			if (
				!routingState ||
				routingKey !== nextRoutingKey ||
				routingState.successCounts.length !== config.providers.length
			) {
				routingState = createSearchRoutingState(config.providers.length);
				routingKey = nextRoutingKey;
			}
			const request = {
				query: params.query,
				maxResults,
				...(params.allowed_domains === undefined ? {} : { allowedDomains: params.allowed_domains }),
				...(params.blocked_domains === undefined ? {} : { blockedDomains: params.blocked_domains }),
			};
			const details = await performSearch(
				config,
				request,
				signal,
				routingState,
				(providerLabel, attempts, routeLabels) => {
					const attemptProgress: SearchProgressDetails = {
						...progressDetails,
						currentProvider: providerLabel,
						attempts: [...attempts],
						routeLabels: [...routeLabels],
					};
					onUpdate?.({
						content: [{ type: "text", text: formatSearchProgressText(attemptProgress) }],
						details: attemptProgress,
					});
				},
			);
			return { content: [{ type: "text", text: formatSearchText(details) }], details };
		},
		renderCall: (args, theme) => renderSearchCall(args, theme),
		renderResult: (result, options, theme) => renderSearchResult(result, options, theme),
	});
}

export const web_search = createWebSearchTool(() => ({
	ok: false,
	reason: "missing_config",
	message: "Missing websearch config. Create .pi/websearch.json or ~/.pi/websearch.json before starting pi.",
}));
