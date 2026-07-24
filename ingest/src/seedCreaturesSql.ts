import { writeFileSync } from "node:fs";
import { buildCreatureSections } from "./buildCreatureSections.js";
import { slugify } from "./slugify.js";

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const sections = buildCreatureSections("../dosi-creatures-seed.json");

const lines: string[] = [];
sections.forEach((c, i) => {
  const id = slugify("creature", c.title);
  const order = 100000 + i;
  const headingPath = JSON.stringify(c.headingPath);
  lines.push(
    `INSERT INTO sections (id, chapter, heading, heading_path, "order", type, dm_only_text, read_aloud_text) VALUES ` +
      `(${sqlString(id)}, ${sqlString(c.chapter)}, ${sqlString(c.title)}, ${sqlString(headingPath)}, ${order}, 'creature', ${sqlString(c.dm_only_text)}, '');`
  );
  lines.push(
    `INSERT INTO creature_stats (section_id, stat_block_json) VALUES (${sqlString(id)}, ${sqlString(JSON.stringify(c.stat_block))});`
  );
});

writeFileSync("../worker/seed-creatures.sql", lines.join("\n") + "\n");
console.log(`Wrote ${sections.length} creature sections to worker/seed-creatures.sql`);
