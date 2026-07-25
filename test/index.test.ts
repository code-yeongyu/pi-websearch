import { beforeEach, describe, expect, it, vi } from "vitest";
import websearchExtension from "../src/index.js";
import type { ConfigLoadResult } from "../src/websearch/types.js";

type SessionHandler = (event: object, ctx: object) => Promise<void> | void;
type LoadWebsearchConfig = (options: { readonly cwd: string }) => Promise<ConfigLoadResult>;

const loadWebsearchConfig = vi.hoisted(() => vi.fn<LoadWebsearchConfig>());

vi.mock("../src/websearch/config.js", () => ({ loadWebsearchConfig }));

const activeConfig: ConfigLoadResult = {
	ok: true,
	source: "test",
	config: {
		strategy: "priority",
		fallback: true,
		auto: true,
		providers: [{ provider: "duckduckgo-html" }],
	},
};

const missingConfig: ConfigLoadResult = {
	ok: false,
	reason: "missing_config",
	message: "Missing websearch config. Create .pi/websearch.json or ~/.pi/websearch.json before starting pi.",
};

function createTheme() {
	return { fg: (_key: string, value: string) => value };
}

describe("websearch extension UI", () => {
	beforeEach(() => {
		loadWebsearchConfig.mockReset();
		loadWebsearchConfig.mockResolvedValue(activeConfig);
	});

	it("#given default backend #when session starts #then clears startup widget", async () => {
		// given
		let sessionStart: SessionHandler | undefined;
		const setStatus = vi.fn();
		const setWidget = vi.fn();

		// when
		websearchExtension({
			registerTool: vi.fn(),
			registerCommand: vi.fn(),
			on(eventName: string, handler: unknown) {
				if (eventName === "session_start") {
					sessionStart = handler as SessionHandler;
				}
			},
		} as never);
		await sessionStart?.(
			{},
			{
				cwd: "/tmp/no-config",
				model: { provider: "local", api: "openai-completions" },
				ui: { setStatus, setWidget, notify: vi.fn(), theme: createTheme() },
			},
		);

		// then
		expect(setStatus).toHaveBeenCalledWith("pi-websearch", undefined);
		expect(setWidget).toHaveBeenCalledWith("pi-websearch", undefined);
	});

	it("#given provider native model #when session starts #then clears delegated native widget", async () => {
		// given
		let sessionStart: SessionHandler | undefined;
		const setStatus = vi.fn();
		const setWidget = vi.fn();

		// when
		websearchExtension({
			registerTool: vi.fn(),
			registerCommand: vi.fn(),
			on(eventName: string, handler: unknown) {
				if (eventName === "session_start") {
					sessionStart = handler as SessionHandler;
				}
			},
		} as never);
		await sessionStart?.(
			{},
			{
				cwd: "/tmp/no-config",
				model: { provider: "openai", api: "openai-responses" },
				ui: { setStatus, setWidget, notify: vi.fn(), theme: createTheme() },
			},
		);

		// then
		expect(setStatus).toHaveBeenCalledWith("pi-websearch", undefined);
		expect(setWidget).toHaveBeenCalledWith("pi-websearch", undefined);
	});

	it("#given custom OpenAI-compatible provider and missing config #when session starts #then reports missing config", async () => {
		// given
		let sessionStart: SessionHandler | undefined;
		const notify = vi.fn();
		loadWebsearchConfig.mockResolvedValue(missingConfig);

		// when
		websearchExtension({
			registerTool: vi.fn(),
			registerCommand: vi.fn(),
			on(eventName: string, handler: unknown) {
				if (eventName === "session_start") {
					sessionStart = handler as SessionHandler;
				}
			},
		} as never);
		await sessionStart?.(
			{},
			{
				cwd: "/tmp/no-config",
				model: { provider: "apitopia", api: "openai-responses" },
				ui: { setStatus: vi.fn(), setWidget: vi.fn(), notify, theme: createTheme() },
			},
		);

		// then
		expect(loadWebsearchConfig).toHaveBeenCalledWith({ cwd: "/tmp/no-config" });
		expect(notify).toHaveBeenCalledWith(missingConfig.message, "error");
	});
});

describe("websearch /websearch status provider labels", () => {
	beforeEach(() => {
		loadWebsearchConfig.mockReset();
	});

	it("#given active multi-provider config #when /websearch status runs #then providers render as provider/id and collapse discovered native ids", async () => {
		// given
		loadWebsearchConfig.mockResolvedValue({
			ok: true,
			source: "test",
			config: {
				strategy: "priority",
				fallback: true,
				auto: true,
				providers: [
					{ id: "primary", provider: "exa", apiKey: "test-key" },
					{ id: "backup", provider: "duckduckgo-html" },
					{ id: "native-openai-abc123", provider: "openai", apiKey: "test-key" },
				],
			},
		});
		let sessionStart: SessionHandler | undefined;
		type CommandHandler = (rawArgs: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
		let statusCommand: CommandHandler | undefined;
		websearchExtension({
			registerTool: vi.fn(),
			registerCommand(_name: string, definition: { handler: CommandHandler }) {
				statusCommand = definition.handler;
			},
			on(eventName: string, handler: unknown) {
				if (eventName === "session_start") sessionStart = handler as SessionHandler;
			},
		} as never);
		await sessionStart?.(
			{},
			{
				cwd: "/tmp/labels",
				model: { provider: "local", api: "openai-completions" },
				ui: { setStatus: vi.fn(), setWidget: vi.fn(), notify: vi.fn(), theme: createTheme() },
			},
		);
		const notify = vi.fn();

		// when
		await statusCommand?.("status", { ui: { notify } });

		// then
		expect(notify).toHaveBeenCalledTimes(1);
		const call = notify.mock.calls[0];
		expect(call?.[1]).toBe("info");
		expect(call?.[0]).toContain("providers=exa/primary, duckduckgo-html/backup, openai/native");
		expect(call?.[0]).not.toContain("primary/exa");
	});
});
