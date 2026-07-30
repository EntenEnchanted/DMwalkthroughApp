import { readFileSync } from "node:fs";
import type { ParsedSection } from "./types.js";

const EXCLUDED_HEADINGS = new Set(["Credits", "Creature Descriptions", "Item Descriptions"]);

function stripImagesAndNoise(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^-{3,}\s*$/gm, "")
    .trim();
}

export function parseMarkdown(filePath: string): ParsedSection[] {
  const raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");

  const sections: ParsedSection[] = [];
  // stack of {level, title} for headings currently "open", used to build headingPath
  let stack: { level: number; title: string }[] = [];
  let currentChapter = "";
  let order = 0;

  let activeTitle: string | null = null;
  let activeLevel = 0;
  let activeHeadingPath: string[] = [];
  let activeChapter = "";
  let buffer: string[] = [];
  let skipActive = false;

  function flush() {
    if (activeTitle !== null && !skipActive) {
      const text = stripImagesAndNoise(buffer.join("\n"));
      if (text.length > 0) {
        sections.push({
          order: order++,
          level: activeLevel,
          title: activeTitle,
          chapter: activeChapter,
          headingPath: [...activeHeadingPath],
          rawText: text,
        });
      }
    }
    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim().replace(/^Chapter \d+:\s*/, (m) => m); // keep as-is

      if (level === 1) {
        currentChapter = title;
      }

      // pop stack to this level's parent
      stack = stack.filter((s) => s.level < level);
      const headingPath = [...stack.map((s) => s.title)];

      stack.push({ level, title });

      activeTitle = title;
      activeLevel = level;
      activeHeadingPath = headingPath;
      activeChapter = currentChapter;
      skipActive = EXCLUDED_HEADINGS.has(title);
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections;
}

export function extractItemNames(sections: ParsedSection[], filePath: string): string[] {
  // Item Descriptions is excluded from `sections`, so re-scan raw text directly.
  const raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const match = /## Item Descriptions\n([\s\S]*?)\n(?:\n-{3,}|\n#)/.exec(raw);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => /^- \*(.+)\*$/.exec(l.trim())?.[1])
    .filter((x): x is string => Boolean(x));
}

// Chapter numbering by parsed first-appearance order, not by parsing title
// text — different modules use different chapter-naming conventions (DoSI:
// "Chapter 1: Dragon's Rest"; Lost Mine of Phandelver: plain titles like
// "Goblin Arrows" with no "Chapter N:" prefix at all). This is verified
// equivalent to the old text-parsing scheme for DoSI's actual chapters
// (Running the Adventure=0, Chapter 1-4=1-4, Appendix A=5, Appendix B=6),
// so dosi's existing ids are unaffected.
export function buildChapterIndex(sections: ParsedSection[]): (chapter: string) => number {
  const order = new Map<string, number>();
  for (const s of sections) {
    if (!order.has(s.chapter)) order.set(s.chapter, order.size);
  }
  return (chapter: string) => order.get(chapter) ?? 99;
}
