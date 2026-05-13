import { describe, expect, it, vi } from "vitest";

import websearchExtension, { isWebsearchEnabled } from "../src/index.js";

const ENABLE_ENV = "PI_WEBSEARCH";

describe("websearch extension toggle", () => {
	it("returns true when PI_WEBSEARCH is unset", () => {
		delete process.env[ENABLE_ENV];
		expect(isWebsearchEnabled()).toBe(true);
	});

	it.each(["1", "true", "yes", "on", " TRUE ", "\tYeS\n"])(
		"returns true for truthy PI_WEBSEARCH value %s",
		(envValue) => {
			process.env[ENABLE_ENV] = envValue;
			expect(isWebsearchEnabled()).toBe(true);
		},
	);

	it.each(["0", "false", "no", "off", " OFF ", "\nNo\t"])(
		"returns false for falsy PI_WEBSEARCH value %s",
		(envValue) => {
			process.env[ENABLE_ENV] = envValue;
			expect(isWebsearchEnabled()).toBe(false);
		},
	);

	it("returns true for unknown PI_WEBSEARCH values", () => {
		process.env[ENABLE_ENV] = "definitely";
		expect(isWebsearchEnabled()).toBe(true);
	});

	it("is a no-op when PI_WEBSEARCH is disabled", () => {
		process.env[ENABLE_ENV] = "0";
		const registerTool = vi.fn();
		const on = vi.fn();
		const registerCommand = vi.fn();
		websearchExtension({ registerTool, on, registerCommand } as never);
		expect(registerTool).not.toHaveBeenCalled();
		expect(on).not.toHaveBeenCalled();
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("registers tool, hooks, and command when PI_WEBSEARCH is unset", () => {
		delete process.env[ENABLE_ENV];
		const registerTool = vi.fn();
		const on = vi.fn();
		const registerCommand = vi.fn();
		websearchExtension({ registerTool, on, registerCommand } as never);
		expect(registerTool).toHaveBeenCalledTimes(1);
		expect(on).toHaveBeenCalledTimes(2);
		expect(registerCommand).toHaveBeenCalledTimes(1);
	});

	it("#given openai active model and no config #when session starts #then defers without warning", async () => {
		// given
		delete process.env[ENABLE_ENV];
		const registerTool = vi.fn();
		const sessionHandlers = new Map<string, (event: object, ctx: ProviderBypassContext) => Promise<void> | void>();
		const on = vi.fn((name: string, handler: (event: object, ctx: ProviderBypassContext) => Promise<void> | void) => {
			sessionHandlers.set(name, handler);
		});
		const registerCommand = vi.fn();
		const context = providerBypassContext("openai");

		// when
		websearchExtension({ registerTool, on, registerCommand } as never);
		await sessionHandlers.get("session_start")?.({}, context);

		// then
		expect(registerTool).toHaveBeenCalledTimes(1);
		expect(context.ui.notify).not.toHaveBeenCalled();
		expect(context.ui.setStatus).toHaveBeenCalledWith("pi-websearch", undefined);
		expect(context.ui.setWidget).toHaveBeenCalledWith("pi-websearch", undefined);
	});

	it("#given anthropic active model and no config #when session starts #then defers without warning", async () => {
		// given
		delete process.env[ENABLE_ENV];
		const sessionHandlers = new Map<string, (event: object, ctx: ProviderBypassContext) => Promise<void> | void>();
		const on = vi.fn((name: string, handler: (event: object, ctx: ProviderBypassContext) => Promise<void> | void) => {
			sessionHandlers.set(name, handler);
		});
		const context = providerBypassContext("anthropic");

		// when
		websearchExtension({ registerTool: vi.fn(), on, registerCommand: vi.fn() } as never);
		await sessionHandlers.get("session_start")?.({}, context);

		// then
		expect(context.ui.notify).not.toHaveBeenCalled();
		expect(context.ui.setStatus).toHaveBeenCalledWith("pi-websearch", undefined);
		expect(context.ui.setWidget).toHaveBeenCalledWith("pi-websearch", undefined);
	});

	it("#given non-native active model and no config #when session starts #then enables default without warning", async () => {
		// given
		delete process.env[ENABLE_ENV];
		const sessionHandlers = new Map<string, (event: object, ctx: ProviderBypassContext) => Promise<void> | void>();
		const on = vi.fn((name: string, handler: (event: object, ctx: ProviderBypassContext) => Promise<void> | void) => {
			sessionHandlers.set(name, handler);
		});
		const context = providerBypassContext("apitopia");

		// when
		websearchExtension({ registerTool: vi.fn(), on, registerCommand: vi.fn() } as never);
		await sessionHandlers.get("session_start")?.({}, context);

		// then
		expect(context.ui.notify).not.toHaveBeenCalled();
		expect(context.ui.setStatus).toHaveBeenCalledWith("pi-websearch", undefined);
		expect(context.ui.setWidget).toHaveBeenCalledWith("pi-websearch", undefined);
	});
});

type ProviderBypassContext = {
	cwd: string;
	model: { provider: string };
	ui: {
		theme: { fg: (kind: string, message: string) => string };
		setStatus: ReturnType<typeof vi.fn>;
		setWidget: ReturnType<typeof vi.fn>;
		notify: ReturnType<typeof vi.fn>;
	};
};

function providerBypassContext(provider: string): ProviderBypassContext {
	return {
		cwd: "/missing-config-project",
		model: { provider },
		ui: {
			theme: { fg: (_kind, message) => message },
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			notify: vi.fn(),
		},
	};
}
