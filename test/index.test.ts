import { describe, expect, it, vi } from "vitest";

import websearchExtension from "../src/index.js";

type SessionHandler = (event: object, ctx: object) => Promise<void> | void;

function createTheme() {
	return { fg: (_key: string, value: string) => value };
}

describe("websearch extension UI", () => {
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
});
