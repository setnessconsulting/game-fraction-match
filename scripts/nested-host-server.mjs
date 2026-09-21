/**
 * Nested asset-base harness (GAME-185).
 *
 * games-site serves immutable static-web artifacts from a versioned nested prefix, for example
 * `/game-assets/fraction-match/<version>/index.html` with the build's assets beneath that same
 * versioned base. Testing only `/index.html` would not catch a build that assumes domain-root
 * hosting, so this harness mounts `dist/` under exactly that nested prefix and 404s everything
 * else — including the root path the artifact must not depend on.
 *
 * It uses Node's standard library only and is intentionally trivial: it is a qualification
 * harness, not a web server. GAME-335 owns the real games-site host seam.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { NESTED_BASE_PATH } from "./lib/nestedHostPath.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(repositoryRoot, "dist");

const host = process.env.FM_NESTED_HOST_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.FM_NESTED_HOST_PORT ?? "4183", 10);

const contentTypeByExtension = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function send(response, status, headers, body = "") {
  response.writeHead(status, {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

async function serveFile(response, absolutePath) {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      send(response, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
      return;
    }
    const body = await readFile(absolutePath);
    send(
      response,
      200,
      {
        "content-length": String(body.byteLength),
        "content-type": contentTypeByExtension.get(extname(absolutePath).toLowerCase()) ?? "application/octet-stream",
      },
      body,
    );
  } catch {
    send(response, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
  }
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, { "content-type": "text/plain; charset=utf-8" }, "Method not allowed\n");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    send(response, 400, { "content-type": "text/plain; charset=utf-8" }, "Bad request\n");
    return;
  }

  // Mirror static hosting: the versioned directory itself resolves to its index document.
  if (pathname === NESTED_BASE_PATH) {
    send(response, 308, { location: `${NESTED_BASE_PATH}/` });
    return;
  }

  if (!pathname.startsWith(`${NESTED_BASE_PATH}/`)) {
    // Anything outside the versioned prefix must not exist. This is the guard that proves the
    // artifact is not accidentally depending on domain-root hosting.
    send(response, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
    return;
  }

  const relativePath = pathname.slice(NESTED_BASE_PATH.length + 1);
  const absolutePath = resolve(distRoot, relativePath === "" ? "index.html" : relativePath);

  if (!absolutePath.startsWith(distRoot + sep)) {
    send(response, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
    return;
  }

  void serveFile(response, absolutePath);
});

server.listen(port, host, () => {
  console.log(`nested asset-base harness serving ${distRoot} at http://${host}:${port}${NESTED_BASE_PATH}/`);
});
