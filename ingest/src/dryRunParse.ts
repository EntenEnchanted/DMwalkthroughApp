import { parseMarkdown, extractItemNames, chapterNumber } from "./parseMarkdown.js";

const filePath = "../Dragons of Stormwreck Isle.md";
const sections = parseMarkdown(filePath);

console.log(`Total sections parsed: ${sections.length}\n`);
for (const s of sections) {
  const path = [...s.headingPath, s.title].join(" > ");
  console.log(`[${chapterNumber(s.chapter)}] (${s.rawText.length} chars) ${path}`);
}

console.log("\nItem names found:", extractItemNames(sections, filePath));
