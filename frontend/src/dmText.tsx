import type { ReactNode } from "react";

const DIRECTIVE_PATTERN = /\[\[directive\]\]([\s\S]*?)\[\[\/directive\]\]/g;

/**
 * Renders dm_only_text, highlighting [[directive]]...[[/directive]] spans
 * (instructions telling the DM to do something or prompt the players)
 * separately from surrounding reference/background prose.
 */
export function renderDmText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  DIRECTIVE_PATTERN.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span className="directive" key={key++}>
        {match[1]}
      </span>
    );
    lastIndex = DIRECTIVE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
