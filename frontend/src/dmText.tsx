import { Fragment } from "react";

const COND_PATTERN = /<cond>([\s\S]*?)<\/cond>/g;

/** Renders dm_only_text, highlighting <cond>...</cond> spans that are conditional on party history. */
export function DmOnlyText({ text }: { text: string }) {
  const parts: { text: string; conditional: boolean }[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(COND_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index), conditional: false });
    parts.push({ text: match[1], conditional: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), conditional: false });

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.conditional ? <mark className="conditional-note">{part.text}</mark> : part.text}
        </Fragment>
      ))}
    </>
  );
}
