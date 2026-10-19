import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import directory from "../api/directory.ts";
import { securityHeaders } from "./security.ts";
import type { PublicFile } from "./build-public.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "dist-manifest.json"), "utf8")
) as { files: PublicFile[] };
const routes = new Map(
  manifest.files.flatMap((file) =>
    file.routes.map((route) => [route, file] as const)
  )
);
const port = Number(process.env.PORT ?? 4177);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");
createServer((request, response) => {
  const send = (
    status: number,
    body: string | Uint8Array,
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
  const host = request.headers.host?.split(":")[0];
  if (host !== "127.0.0.1" && host !== "localhost")
    return send(403, "Local preview only", "text/plain; charset=utf-8");
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://127.0.0.1");
  } catch {
    return send(400, "Invalid request", "text/plain; charset=utf-8");
  }
  if (url.pathname === "/directory" || url.pathname === "/api/directory")
    return directory(request, response);
  const file = routes.get(url.pathname);
  if (file)
    return send(200, readFileSync(join(root, "dist", file.path)), file.type);
  return send(404, readFileSync(join(root, "dist/404.html")));
})
  .on("error", (error) => {
    console.error(`Public preview could not start: ${error.message}`);
    process.exitCode = 1;
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`AI 500 public release preview: http://127.0.0.1:${port}`)
  );
