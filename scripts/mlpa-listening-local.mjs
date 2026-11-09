// Local development receiver only. Never deploy this as a production API.
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  link,
  unlink,
  realpath,
} from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { validateSubmission } from "../src/lib/mlpa-listening.ts";

export function createLocalServer({ root, dataDir }) {
  const staticRoot = resolve(root);
  const storage = resolve(dataDir);
  if (storage === staticRoot || storage.startsWith(staticRoot + sep))
    throw new Error("Response storage must be outside the static root");
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".wav": "audio/wav",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".xml": "application/xml",
  };
  return createServer(async (req, res) => {
    const json = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const expectedHost = `127.0.0.1:${res.socket.localPort}`;
      if (req.headers.host !== expectedHost)
        return json(403, { error: "Host not allowed" });
      const url = new URL(req.url, `http://${expectedHost}`);
      if (url.pathname.startsWith("/api/")) {
        if (
          url.pathname === "/api/mlpa-listening/config" &&
          req.method === "GET"
        )
          return json(200, { mode: "local-test" });
        if (
          url.pathname !== "/api/mlpa-listening/responses" ||
          req.method !== "POST"
        )
          return json(404, { error: "Not found" });
        if (req.headers.origin !== `http://${expectedHost}`)
          return json(403, { error: "Origin not allowed" });
        if (req.headers["content-type"] !== "application/json")
          return json(415, { error: "JSON required" });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) return json(413, { error: "回答が大きすぎます。" });
          chunks.push(chunk);
        }
        let response;
        try {
          response = validateSubmission(
            JSON.parse(Buffer.concat(chunks).toString("utf8"))
          );
        } catch (error) {
          return json(400, {
            error: error instanceof Error ? error.message : "Invalid response",
          });
        }
        await mkdir(storage, { recursive: true, mode: 0o700 });
        const target = resolve(
          storage,
          `${response.participant_id}.responses.json`
        );
        const body = JSON.stringify(response, null, 2) + "\n";
        const temp = resolve(storage, `.${randomUUID()}.tmp`);
        await writeFile(temp, body, { flag: "wx", mode: 0o600 });
        try {
          await link(temp, target); // Exclusive and atomic, even for simultaneous POSTs.
          return json(201, {
            status: "accepted",
            participant_id: response.participant_id,
          });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          const previous = await readFile(target, "utf8");
          return previous === body
            ? json(200, {
                status: "accepted",
                participant_id: response.participant_id,
              })
            : json(409, {
                error:
                  "この参加者番号は回答済みです。再登録はできません。担当者にご相談ください。",
              });
        } finally {
          await unlink(temp);
        }
      }
      if (!["GET", "HEAD"].includes(req.method))
        return json(405, { error: "Method not allowed" });
      let file = resolve(staticRoot, "." + decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) file = resolve(file, "index.html");
      if (!file.startsWith(staticRoot + sep))
        return json(404, { error: "Not found" });
      try {
        const actual = await realpath(file);
        if (!actual.startsWith(staticRoot + sep))
          return json(404, { error: "Not found" });
        const bytes = await readFile(actual);
        res.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
      } catch {
        return json(404, { error: "Not found" });
      }
    } catch {
      if (!res.headersSent)
        json(500, {
          error: "保存できませんでした。同じ内容で再送してください。",
        });
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = process.argv[2];
  const dataDir = process.argv[3];
  if (!root || !dataDir)
    throw new Error(
      "Usage: node scripts/mlpa-listening-local.mjs <dist> <PRIVATE-response-dir> [port]"
    );
  const server = createLocalServer({ root, dataDir });
  server.listen(Number(process.argv[4] ?? 4340), "127.0.0.1", () => {
    process.stdout.write(
      `Local test only: http://127.0.0.1:${server.address().port}/mlpa-listening/\n`
    );
  });
}
