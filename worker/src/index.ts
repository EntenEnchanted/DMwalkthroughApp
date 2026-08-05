import type { Env } from "./types.js";
import { handleSearch } from "./routes/search.js";
import { handleChat } from "./routes/chat.js";
import { handleGetSection, handleGetNarrativeReferences } from "./routes/sections.js";
import { handleToggleReveal } from "./routes/reveals.js";
import { handleLoadSections } from "./routes/admin.js";
// TEMPORARY: remove once the scene and LMoP passes are done.
import { handleClassify } from "./routes/classify.js";
import { handleGetCampaignOutline } from "./routes/campaign.js";
import { handleGetCreatures } from "./routes/creatures.js";
import { handleLogin, handleLogout, handleMe } from "./routes/auth.js";
import { handleListModules, handleListCampaigns, handleCreateCampaign } from "./routes/campaigns.js";
import { handleGetOrCreateInvite, handleRedeemInvite } from "./routes/invites.js";
import { handleGetOrCreateDmInvite, handleRegisterDm } from "./routes/dmInvites.js";
import {
  handleListCharacters,
  handleListMyCharacters,
  handleGetCharacter,
  handleUpdateCharacter,
  handleAddItem,
  handleUpdateItem,
  handleDeleteItem,
} from "./routes/characters.js";
import { handleListSrd, handleGetSrdEntry } from "./routes/srd.js";
import {
  handleCreateMap,
  handleListMaps,
  handleSetActiveMap,
  handleGetActiveMap,
  handleAddToken,
  handleUpdateToken,
  handleDeleteToken,
  handleToggleFogCell,
  handleUploadMapImage,
  handleGetMapImage,
} from "./routes/maps.js";

const ALLOWED_ORIGIN_SUFFIXES = [".dosi-dm-companion.pages.dev"];
const ALLOWED_ORIGINS = new Set([
  "https://dosi-dm-companion.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_SUFFIXES.some((suffix) => origin.endsWith(suffix));
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://dosi-dm-companion.pages.dev";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const CORS_HEADERS = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    // CSRF: cookie-authenticated mutating requests must carry an Origin
    // we recognize — a cross-site page can send a simple POST with the
    // session cookie attached (SameSite=None is required cross-site; see
    // Phase 0 commit), but it can't forge our Origin. /admin/* is exempt:
    // it's authenticated by a header token the caller must already know,
    // not a cookie, so it isn't CSRF-able and is normally called from a
    // script with no Origin header at all.
    if (!SAFE_METHODS.has(request.method) && !pathname.startsWith("/admin/")) {
      const origin = request.headers.get("Origin");
      if (!origin || !isAllowedOrigin(origin)) {
        const rejected = new Response("Forbidden", { status: 403 });
        for (const [k, v] of Object.entries(CORS_HEADERS)) rejected.headers.set(k, v);
        return rejected;
      }
    }

    let response: Response;

    try {
      const campaignSubMatch = /^\/api\/campaigns\/([^/]+)\/(.+)$/.exec(pathname);

      if (pathname === "/api/auth/login" && request.method === "POST") {
        response = await handleLogin(request, env);
      } else if (pathname === "/api/auth/logout" && request.method === "POST") {
        response = await handleLogout(request, env);
      } else if (pathname === "/api/auth/me" && request.method === "GET") {
        response = await handleMe(request, env);
      } else if (pathname === "/api/auth/redeem-invite" && request.method === "POST") {
        response = await handleRedeemInvite(request, env);
      } else if (pathname === "/api/auth/register-dm" && request.method === "POST") {
        response = await handleRegisterDm(request, env);
      } else if (pathname === "/api/dm-invite" && request.method === "POST") {
        response = await handleGetOrCreateDmInvite(request, env);
      } else if (pathname === "/api/modules" && request.method === "GET") {
        response = await handleListModules(env);
      } else if (pathname === "/api/campaigns" && request.method === "GET") {
        response = await handleListCampaigns(request, env);
      } else if (pathname === "/api/campaigns" && request.method === "POST") {
        response = await handleCreateCampaign(request, env);
      } else if (pathname === "/admin/load-sections" && request.method === "POST") {
        response = await handleLoadSections(request, env);
      } else if (pathname === "/admin/classify" && request.method === "POST") {
        // TEMPORARY: remove once the scene and LMoP passes are done.
        response = await handleClassify(request, env);
      } else if (pathname === "/api/me/characters" && request.method === "GET") {
        response = await handleListMyCharacters(request, env);
      } else if (pathname === "/api/srd" && request.method === "GET") {
        response = await handleListSrd(request, env);
      } else if (/^\/api\/srd\/[^/]+$/.test(pathname) && request.method === "GET") {
        response = await handleGetSrdEntry(pathname.split("/")[3], request, env);
      } else if (/^\/api\/map-images\/(.+)$/.test(pathname) && request.method === "GET") {
        const key = decodeURIComponent(/^\/api\/map-images\/(.+)$/.exec(pathname)![1]);
        response = await handleGetMapImage(key, env);
      } else if (campaignSubMatch) {
        const campaignId = campaignSubMatch[1];
        const sub = campaignSubMatch[2];
        const sectionMatch = /^sections\/([^/]+)$/.exec(sub);
        const narrativeMatch = /^sections\/([^/]+)\/narrative-references$/.exec(sub);
        const revealMatch = /^reveals\/([^/]+)\/toggle$/.exec(sub);

        if (sub === "invite" && request.method === "POST") {
          response = await handleGetOrCreateInvite(campaignId, request, env);
        } else if (sub === "maps/upload-image" && request.method === "POST") {
          response = await handleUploadMapImage(campaignId, request, env);
        } else if (sub === "maps" && request.method === "POST") {
          response = await handleCreateMap(campaignId, request, env);
        } else if (sub === "maps" && request.method === "GET") {
          response = await handleListMaps(campaignId, request, env);
        } else if (sub === "active-map" && request.method === "POST") {
          response = await handleSetActiveMap(campaignId, request, env);
        } else if (sub === "active-map" && request.method === "GET") {
          response = await handleGetActiveMap(campaignId, request, env);
        } else if (sub === "tokens" && request.method === "POST") {
          response = await handleAddToken(campaignId, request, env);
        } else if (sub === "outline" && request.method === "GET") {
          response = await handleGetCampaignOutline(campaignId, request, env);
        } else if (sub === "creatures" && request.method === "GET") {
          response = await handleGetCreatures(campaignId, request, env);
        } else if (sub === "characters" && request.method === "GET") {
          response = await handleListCharacters(campaignId, request, env);
        } else if (sub === "search" && request.method === "GET") {
          response = await handleSearch(campaignId, request, env);
        } else if (sub === "chat" && request.method === "POST") {
          response = await handleChat(campaignId, request, env);
        } else if (narrativeMatch && request.method === "GET") {
          response = await handleGetNarrativeReferences(campaignId, narrativeMatch[1], request, env);
        } else if (sectionMatch && request.method === "GET") {
          response = await handleGetSection(campaignId, sectionMatch[1], request, env);
        } else if (revealMatch && request.method === "POST") {
          response = await handleToggleReveal(campaignId, revealMatch[1], request, env);
        } else {
          response = new Response("Not found", { status: 404 });
        }
      } else if (/^\/api\/characters\/[^/]+$/.test(pathname) && (request.method === "GET" || request.method === "PATCH")) {
        const characterId = pathname.split("/")[3];
        response =
          request.method === "GET"
            ? await handleGetCharacter(characterId, request, env)
            : await handleUpdateCharacter(characterId, request, env);
      } else if (/^\/api\/characters\/[^/]+\/items$/.test(pathname) && request.method === "POST") {
        const characterId = pathname.split("/")[3];
        response = await handleAddItem(characterId, request, env);
      } else if (
        /^\/api\/characters\/[^/]+\/items\/[^/]+$/.test(pathname) &&
        (request.method === "PATCH" || request.method === "DELETE")
      ) {
        const parts = pathname.split("/");
        const characterId = parts[3];
        const itemId = parts[5];
        response =
          request.method === "PATCH"
            ? await handleUpdateItem(characterId, itemId, request, env)
            : await handleDeleteItem(characterId, itemId, request, env);
      } else if (
        /^\/api\/tokens\/[^/]+$/.test(pathname) &&
        (request.method === "PATCH" || request.method === "DELETE")
      ) {
        const tokenId = pathname.split("/")[3];
        response =
          request.method === "PATCH"
            ? await handleUpdateToken(tokenId, request, env)
            : await handleDeleteToken(tokenId, request, env);
      } else if (/^\/api\/maps\/[^/]+\/fog\/toggle$/.test(pathname) && request.method === "POST") {
        const mapId = pathname.split("/")[3];
        response = await handleToggleFogCell(mapId, request, env);
      } else {
        response = new Response("Not found", { status: 404 });
      }
    } catch (err) {
      response = new Response(`Internal error: ${(err as Error).message}`, { status: 500 });
    }

    const newResponse = new Response(response.body, response);
    for (const [k, v] of Object.entries(CORS_HEADERS)) newResponse.headers.set(k, v);
    return newResponse;
  },
};
