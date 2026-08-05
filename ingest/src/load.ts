/**
 * Loads an already-classified sections file into D1 and Vectorize.
 *
 * run.ts classifies and then loads in one pass, which is wrong whenever the
 * classification already exists — after a scene pass, after remigrate.ts, or
 * after reviewing and hand-correcting output. This loads only.
 *
 *   WORKER_ADMIN_URL=https://…workers.dev WORKER_ADMIN_TOKEN=… \
 *     npm run load -- output/dosi-chapter-all.json
 *
 * Sections are sent in small batches because /admin/load-sections embeds each
 * one through Workers AI and writes six tables per section; the whole file in a
 * single request runs into subrequest limits.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

async function main() {
  const path = process.argv[2];
  const workerUrl = process.env.WORKER_ADMIN_URL;
  const token = process.env.WORKER_ADMIN_TOKEN;

  if (!path) {
    console.error("usage: npm run load -- <sections.json>");
    process.exit(1);
  }
  if (!workerUrl || !token) {
    console.error("WORKER_ADMIN_URL and WORKER_ADMIN_TOKEN must be set (see ingest/.env.example)");
    process.exit(1);
  }

  const sections = JSON.parse(readFileSync(path, "utf-8")) as { id: string }[];
  const url = `${workerUrl.replace(/\/$/, "")}/admin/load-sections`;
  let loaded = 0;

  for (let i = 0; i < sections.length; i += BATCH_SIZE) {
    const batch = sections.slice(i, i + BATCH_SIZE);
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Admin-Token": token },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        loaded += batch.length;
        process.stdout.write(`${loaded}/${sections.length} `);
        break;
      }
      const body = (await res.text()).slice(0, 200);
      if (attempt === MAX_ATTEMPTS) {
        console.error(`\nFailed on batch starting at ${i}: ${res.status} ${body}`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  console.log(`\nLoaded ${loaded} sections.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
