import type { IncomingMessage, ServerResponse } from "node:http";
import rawEdition from "../data/edition.json" with { type: "json" };
import rawPeople from "../data/people.json" with { type: "json" };
import { validatePeople, type Edition } from "../internal/catalog.ts";
import { createPublicRenderer } from "../internal/public-render.ts";
import { securityHeaders } from "../internal/security.ts";

// The build validates the edition schema; the runtime validates all profile records.
const edition = rawEdition as Edition;
const people = validatePeople(rawPeople, edition);
const { directory } = createPublicRenderer(edition, people);

/** Query-only directory rendering: no filesystem routes, writes, cookies, or outbound calls. */
export default function handler(
  request: IncomingMessage,
  response: ServerResponse
): void {
  const send = (
    status: number,
    body: string,
    type = "text/html; charset=utf-8"
  ) => {
    response.writeHead(status, {
      ...securityHeaders,
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(405, "Method not allowed", "text/plain; charset=utf-8");
  }
  if ((request.url?.length ?? 0) > 4096)
    return send(414, "Request URI too long", "text/plain; charset=utf-8");
  let url: URL;
  try {
    url = new URL(request.url ?? "/directory", "https://ai500.invalid");
  } catch {
    return send(400, "Invalid request", "text/plain; charset=utf-8");
  }
  if (url.pathname !== "/directory" && url.pathname !== "/api/directory") {
    return send(404, "Not found", "text/plain; charset=utf-8");
  }
  return send(200, directory(url));
}
