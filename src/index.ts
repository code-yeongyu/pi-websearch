import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { loadWebsearchConfig } from "./websearch/config.js";
import { createWebSearchTool } from "./websearch/tool.js";
import type { ConfigLoadResult } from "./websearch/types.js";

const STATUS_KEY = "pi-websearch";
const WIDGET_KEY = "pi-websearch";

export default function (pi: ExtensionAPI): void {
	let state: ConfigLoadResult = {
		ok: false,
		reason: "missing_config",
		message: "Missing websearch config. Create .pi/websearch.json or ~/.pi/websearch.json before starting pi.",
	};

	function providerList(config: Extract<ConfigLoadResult, { ok: true }>["config"]): string {
		return config.providers.map((provider) => provider.id ?? provider.provider).join(", ");
	}

	function updateUi(ctx: ExtensionContext): void {
		if (state.ok) {
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
		state = await loadWebsearchConfig({ cwd: ctx.cwd });
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
			ctx.ui.notify(`Web search inactive: ${state.message}`, "error");
		},
	});
}
