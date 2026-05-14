import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { buildNativeEntry, type NativeModelInfo, type NativeModelRegistry } from "./native.js";
import { renderSearchCall, renderSearchResult } from "./renderers.js";
import { createSearchRoutingState, formatSearchText, performSearch, type SearchRoutingState } from "./search.js";
import type {
	ConfigLoadResult,
	SearchDetails,
	SearchProgressDetails,
	SearchProviderEntry,
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

interface WebSearchToolContext {
	model?: NativeModelInfo;
	modelRegistry?: NativeModelRegistry;
}

async function configWithNativeRoute(config: WebsearchConfig, ctx?: WebSearchToolContext): Promise<WebsearchConfig> {
	if (!config.auto) return config;
	const nativeEntry = await buildNativeEntry(ctx?.model, ctx?.modelRegistry);
	return nativeEntry ? { ...config, providers: [nativeEntry, ...config.providers] } : config;
}

function providerLabel(provider: SearchProviderEntry): string {
	return provider.id ? `${provider.id}/${provider.provider}` : provider.provider;
}

function formatSearchProgressText(details: SearchProgressDetails): string {
	const route = details.providerLabels.length > 0 ? details.providerLabels.join(" -> ") : "configured providers";
	return `Searching "${details.query}" via ${route} (max ${details.maxResults})`;
}

export function createWebSearchTool(getConfig: ConfigProvider) {
	let routingState: SearchRoutingState | undefined;
	let routingKey = "";

	return defineTool<typeof Params, SearchRenderDetails>({
		name: "web_search",
		label: "Web Search",
		description: "Search the web for current information and return source URLs for citation.",
		promptSnippet: "Search the web for current information, documentation, news, or external facts.",
		promptGuidelines: ["After using web_search, cite relevant returned URLs in the final answer."],
		parameters: Params,
		async execute(_toolCallId, params, signal, onUpdate, ctx?: WebSearchToolContext) {
			if (params.allowed_domains?.length && params.blocked_domains?.length) {
				const message = "Error: Cannot specify both allowed_domains and blocked_domains in the same request";
				const details: SearchDetails = {
					provider: "exa",
					query: params.query,
					results: [],
					durationMs: 0,
					truncated: false,
					error: message,
				};
				return { content: [{ type: "text", text: message }], details };
			}

			const loaded = getConfig();
			if (!loaded.ok) {
				if (loaded.reason === "provider_native_bypass") {
					const details: SearchDetails = {
						provider: "openai",
						query: params.query,
						results: [],
						durationMs: 0,
						truncated: false,
						error: loaded.message,
					};
					return { content: [{ type: "text", text: loaded.message }], details };
				}
				const details: SearchDetails = {
					provider: "exa",
					query: params.query,
					results: [],
					durationMs: 0,
					truncated: false,
					error: loaded.message,
				};
				return { content: [{ type: "text", text: loaded.message }], details };
			}

			const maxResults = loaded.config.providers[0]?.maxResults ?? 10;
			const config = await configWithNativeRoute(loaded.config, ctx);
			const progressDetails: SearchProgressDetails = {
				phase: "searching",
				query: params.query,
				providerLabels: config.providers.map(providerLabel),
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
			const details = await performSearch(
				config,
				{
					query: params.query,
					maxResults,
					allowedDomains: params.allowed_domains,
					blockedDomains: params.blocked_domains,
				},
				signal,
				routingState,
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
