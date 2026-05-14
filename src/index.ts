import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { loadWebsearchConfig } from "./websearch/config.js";
import { createWebSearchTool } from "./websearch/tool.js";
import type { ConfigLoadResult, SearchProviderEntry, WebsearchConfig } from "./websearch/types.js";

const STATUS_KEY = "pi-websearch";
const WIDGET_KEY = "pi-websearch";
const NATIVE_BYPASS_MESSAGE = "Native provider web search is handled by the built-in provider extension.";
const NATIVE_WIDGET_LINES = ["Web Search native", "OpenAI/Anthropic provider-native search handles this model"];

type ProviderModelContext = {
	provider?: string;
	api?: string;
};

function isProviderNativeBypass(model: ProviderModelContext | undefined): boolean {
	return (
		model?.provider === "openai" ||
		model?.provider === "anthropic" ||
		model?.api === "anthropic-messages" ||
		model?.api === "openai-responses" ||
		model?.api === "azure-openai-responses"
	);
}

export default function (pi: ExtensionAPI): void {
	let state: ConfigLoadResult = {
		ok: false,
		reason: "missing_config",
		message: "Missing websearch config. Create .pi/websearch.json or ~/.pi/websearch.json before starting pi.",
	};

	function providerLabel(provider: SearchProviderEntry): string {
		return provider.id ? `${provider.id}/${provider.provider}` : provider.provider;
	}

	function providerRoute(config: WebsearchConfig): string {
		return config.providers.map(providerLabel).join(" -> ");
	}

	function providerList(config: WebsearchConfig): string {
		return config.providers.map(providerLabel).join(", ");
	}

	function readyWidgetLines(loaded: Extract<ConfigLoadResult, { ok: true }>): string[] {
		return [
			"Web Search ready",
			`source: ${loaded.source} · route: ${providerRoute(loaded.config)} · strategy: ${loaded.config.strategy} · auto ${loaded.config.auto ? "on" : "off"}`,
		];
	}

	function updateUi(ctx: ExtensionContext): void {
		if (ctx.hasUI === false) return;
		if (state.ok) {
			ctx.ui.setStatus(STATUS_KEY, "WebSearch ready");
			ctx.ui.setWidget(WIDGET_KEY, readyWidgetLines(state), { placement: "belowEditor" });
			return;
		}
		if (state.reason === "provider_native_bypass") {
			ctx.ui.setStatus(STATUS_KEY, "WebSearch native");
			ctx.ui.setWidget(WIDGET_KEY, NATIVE_WIDGET_LINES, { placement: "belowEditor" });
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("error", "WebSearch config missing"));
		ctx.ui.setWidget(WIDGET_KEY, [`Web Search inactive: ${state.message}`], { placement: "belowEditor" });
		ctx.ui.notify(state.message, "error");
	}

	pi.registerTool(createWebSearchTool(() => state));

	pi.on("session_start", async (_event, ctx) => {
		state = isProviderNativeBypass(ctx.model)
			? { ok: false, reason: "provider_native_bypass", message: NATIVE_BYPASS_MESSAGE }
			: await loadWebsearchConfig({ cwd: ctx.cwd });
		updateUi(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setWidget(WIDGET_KEY, undefined);
	});

	pi.registerCommand("websearch", {
		description: "Show web search provider status",
		handler: async (rawArgs, ctx) => {
			const args = rawArgs.trim();
			if (args !== "" && args !== "status") {
				ctx.ui.notify("Usage: /websearch status", "warning");
				return;
			}
			if (state.ok) {
				ctx.ui.notify(
					`Web search active: strategy=${state.config.strategy}, auto=${state.config.auto ? "enabled" : "disabled"}, providers=${providerList(state.config)}`,
					"info",
				);
				return;
			}
			ctx.ui.notify(
				state.reason === "provider_native_bypass"
					? `Web search deferred: ${state.message}`
					: `Web search inactive: ${state.message}`,
				state.reason === "provider_native_bypass" ? "info" : "error",
			);
		},
	});
}
