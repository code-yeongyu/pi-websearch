import { anthropicProvider } from "./providers/anthropic.js";
import { braveProvider } from "./providers/brave.js";
import { duckDuckGoHtmlProvider } from "./providers/duckduckgo-html.js";
import { exaProvider } from "./providers/exa.js";
import { googleCseProvider } from "./providers/google-cse.js";
import { kimiProvider } from "./providers/kimi.js";
import { openAiResponsesProvider } from "./providers/openai-responses.js";
import { perplexityProvider } from "./providers/perplexity.js";
import { serpdiveProvider } from "./providers/serpdive.js";
import { serperProvider } from "./providers/serper.js";
import type { ProviderModule } from "./providers/shared.js";
import { parseObjectPayload, resolveDomainFilters } from "./providers/shared.js";
import { tavilyProvider } from "./providers/tavily.js";
import { xaiProvider } from "./providers/xai.js";
import { zAiProvider } from "./providers/z-ai.js";
import type {
	BuiltSearchRequest,
	SearchProvider,
	SearchProviderConfig,
	SearchRequest,
	SearchResultItem,
} from "./types.js";

const PROVIDER_MODULES: Record<SearchProvider, ProviderModule> = {
	exa: exaProvider,
	tavily: tavilyProvider,
	serpdive: serpdiveProvider,
	brave: braveProvider,
	"duckduckgo-html": duckDuckGoHtmlProvider,
	serper: serperProvider,
	"google-cse": googleCseProvider,
	"z-ai": zAiProvider,
	openai: openAiResponsesProvider,
	codex: openAiResponsesProvider,
	anthropic: anthropicProvider,
	perplexity: perplexityProvider,
	xai: xaiProvider,
	kimi: kimiProvider,
};

export function buildSearchRequest(config: SearchProviderConfig, request: SearchRequest): BuiltSearchRequest {
	const maxResults = config.maxResults ?? request.maxResults;
	const { allowedDomains, blockedDomains } = resolveDomainFilters(config, request);
	return PROVIDER_MODULES[config.provider].buildRequest({
		config,
		request,
		maxResults,
		allowedDomains,
		blockedDomains,
	});
}

export function normalizeSearchResponse(provider: SearchProvider, payload: unknown): SearchResultItem[] {
	return PROVIDER_MODULES[provider].normalizeResponse(parseObjectPayload(payload));
}
