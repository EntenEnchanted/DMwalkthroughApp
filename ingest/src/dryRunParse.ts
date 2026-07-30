import { parseMarkdown, extractItemNames, buildChapterIndex } from "./parseMarkdown.js";

const filePath = process.argv[2] ?? "../Dragons of Stormwreck Isle.md";
const sections = parseMarkdown(filePath);
const chapterIndex = buildChapterIndex(sections);

console.log(`Total sections parsed: ${sections.length}\n`);
for (const s of sections) {
  const path = [...s.headingPath, s.title].join(" > ");
  console.log(`[${chapterIndex(s.chapter)}] (${s.rawText.length} chars) ${path}`);
}

console.log("\nItem names found:", extractItemNames(sections, filePath));
