import type { ReactNode } from "react";

const SPAN_PATTERN = /<cond>([\s\S]*?)<\/cond>|\[\[directive\]\]([\s\S]*?)\[\[\/directive\]\]/g;

/**
 * Renders dm_only_text, highlighting two kinds of inline spans distinctly from
 * surrounding background/reference prose:
 * - <cond>...</cond>: guidance conditional on the party's prior actions/choices.
 * - [[directive]]...[[/directive]]: instructions telling the DM to do something
 *   or prompt the players to act.
 */
export function renderDmText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  SPAN_PATTERN.lastIndex = 0;
  while ((match = SPAN_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(
        <mark className="conditional-note" key={key++}>
          {match[1]}
        </mark>
      );
    } else {
      parts.push(
        <span className="directive" key={key++}>
          {match[2]}
        </span>
      );
    }
    lastIndex = SPAN_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
