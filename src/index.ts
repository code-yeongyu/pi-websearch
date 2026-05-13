import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { loadWebsearchConfig } from "./websearch/config.js";
import { createWebSearchTool } from "./websearch/tool.js";
import type { ConfigLoadResult } from "./websearch/types.js";

const STATUS_KEY = "pi-websearch";
const WIDGET_KEY = "pi-websearch";
const ENABLE_ENV = "PI_WEBSEARCH";
const NATIVE_BYPASS_MESSAGE = "Native provider web search is handled by the built-in provider extension.";

type ProviderModelContext = {
	provider?: string;
	api?: string;
};

function parseEnableEnv(envVar: string): boolean {
	const envValue = process.env[envVar];
	if (!envValue) {
		return true;
	}

	const normalized = envValue.trim().toLowerCase();
	if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
		return false;
	}

	if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
		return true;
	}

	// Unknown values fall back to default-on behavior.
	return true;
}

export function isWebsearchEnabled(): boolean {
	return parseEnableEnv(ENABLE_ENV);
}

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
	// When PI_WEBSEARCH disables the extension, keep factory callable but skip all registration side effects.
	if (!isWebsearchEnabled()) {
		return;
	}

	let state: ConfigLoadResult = {
		ok: false,
		reason: "missing_config",
		message: "Missing websearch config. Create .pi/websearch.json or ~/.pi/websearch.json before starting pi.",
	};

	function providerList(config: Extract<ConfigLoadResult, { ok: true }>["config"]): string {
		return config.providers.map((provider) => provider.id ?? provider.provider).join(", ");
	}

	function updateUi(ctx: ExtensionContext): void {
		if (state.ok || state.reason === "provider_native_bypass") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
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
