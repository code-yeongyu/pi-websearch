import { Text } from "@mariozechner/pi-tui";

import type { SearchDetails } from "./types.js";

interface ThemeLike {
	bold(value: string): string;
	fg(key: string, value: string): string;
}

interface SearchArgs {
	query: string;
	allowed_domains?: string[];
	blocked_domains?: string[];
}

interface ResultLike<TDetails> {
	content: ReadonlyArray<{ type: string; text?: string }>;
	details?: TDetails;
}

interface RenderResultOptions {
	expanded?: boolean;
	isPartial?: boolean;
}

function shorten(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function durationText(durationMs: number): string {
	return durationMs >= 1000 ? `${Math.round(durationMs / 1000)}s` : `${durationMs}ms`;
}

function attemptLabel(details: SearchDetails): string {
	return details.attempts
		? details.attempts
				.map(
					(attempt) =>
						`${attempt.entryId ? `${attempt.provider}/${attempt.entryId}` : attempt.provider}:${attempt.error ? "failed" : attempt.resultsCount}`,
				)
				.join(" -> ")
		: "";
}

export function renderSearchCall(args: SearchArgs, theme: ThemeLike): Text {
	const head = theme.fg("toolTitle", theme.bold("web_search "));
	const query = theme.fg("accent", `"${shorten(args.query, 90)}"`);
	const domains = args.allowed_domains ?? args.blocked_domains;
	const filter = domains?.length ? theme.fg("muted", ` domains:${domains.length}`) : "";
	return new Text(head + query + filter, 0, 0);
}

export function renderSearchResult(
	result: ResultLike<SearchDetails>,
	options: RenderResultOptions,
	theme: ThemeLike,
): Text {
	if (options.isPartial) return new Text(theme.fg("warning", "Searching the web..."), 0, 0);

	const details = result.details;
	if (!details) return new Text(theme.fg("muted", result.content[0]?.text ?? ""), 0, 0);
	if (details.error) return new Text(theme.fg("error", details.error), 0, 0);

	const count = details.results.length;
	const provider = details.entryId ? `${details.provider}/${details.entryId}` : details.provider;
	const summary =
		theme.fg("success", `${count} result${count === 1 ? "" : "s"}`) +
		theme.fg(
			"muted",
			` via ${provider}${details.strategy ? ` (${details.strategy})` : ""} in ${durationText(details.durationMs)}`,
		) +
		(details.truncated ? theme.fg("warning", " (truncated)") : "");

	if (!options.expanded || count === 0) return new Text(summary, 0, 0);

	const attempts = attemptLabel(details);
	const rows = attempts ? [summary, theme.fg("muted", `route ${attempts}`)] : [summary];
	for (const item of details.results.slice(0, 8)) {
		rows.push(`${theme.fg("accent", shorten(item.title, 80))} ${theme.fg("dim", shorten(item.url, 100))}`);
		if (item.snippet) rows.push(theme.fg("muted", `  ${shorten(item.snippet, 140)}`));
	}
	if (details.results.length > 8) rows.push(theme.fg("dim", `… ${details.results.length - 8} more sources`));
	return new Text(rows.join("\n"), 0, 0);
}
