import type { Env } from "./types.js";
import { handleSearch } from "./routes/search.js";
import { handleChat } from "./routes/chat.js";
import { handleGetSection, handleGetNarrativeReferences } from "./routes/sections.js";
import { handleToggleReveal } from "./routes/reveals.js";
import { handleLoadSections, handleClassifySection } from "./routes/admin.js";
import { handleGetCampaign } from "./routes/campaign.js";
import { handleGetCreatures } from "./routes/creatures.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    let response: Response;

    try {
      if (pathname === "/api/search" && request.method === "GET") {
        response = await handleSearch(request, env);
      } else if (pathname === "/api/campaign" && request.method === "GET") {
        response = await handleGetCampaign(env);
      } else if (pathname === "/api/creatures" && request.method === "GET") {
        response = await handleGetCreatures(env);
      } else if (pathname === "/api/chat" && request.method === "POST") {
        response = await handleChat(request, env);
      } else if (pathname === "/admin/load-sections" && request.method === "POST") {
        response = await handleLoadSections(request, env);
      } else if (pathname === "/admin/classify" && request.method === "POST") {
        response = await handleClassifySection(request, env);
      } else {
        const sectionMatch = /^\/api\/sections\/([^/]+)$/.exec(pathname);
        const narrativeMatch = /^\/api\/sections\/([^/]+)\/narrative-references$/.exec(pathname);
        const revealMatch = /^\/api\/reveals\/([^/]+)\/toggle$/.exec(pathname);

        if (narrativeMatch && request.method === "GET") {
          response = await handleGetNarrativeReferences(narrativeMatch[1], env);
        } else if (sectionMatch && request.method === "GET") {
          response = await handleGetSection(sectionMatch[1], env);
        } else if (revealMatch && request.method === "POST") {
          response = await handleToggleReveal(revealMatch[1], request, env);
        } else {
          response = new Response("Not found", { status: 404 });
        }
      }
    } catch (err) {
      response = new Response(`Internal error: ${(err as Error).message}`, { status: 500 });
    }

    const newResponse = new Response(response.body, response);
    for (const [k, v] of Object.entries(CORS_HEADERS)) newResponse.headers.set(k, v);
    return newResponse;
  },
};
