import { validateSubmission } from "../src/lib/mlpa-listening";

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
}
interface Database {
  prepare(query: string): Statement;
}
interface Env {
  DB: Database;
  ALLOWED_ORIGIN: string;
  ACCEPTING_RESPONSES: string;
  CONSENT_VERSION: string;
}
export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes), v =>
    v.toString(16).padStart(2, "0")
  ).join("");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = origin !== null && origin === env.ALLOWED_ORIGIN;
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!allowed)
      return json(403, { error: "この送信元からは利用できません。" });
    if (request.method === "GET" && url.pathname === "/status")
      return json(200, {
        accepting:
          env.ACCEPTING_RESPONSES === "true" &&
          Boolean(env.CONSENT_VERSION) &&
          env.CONSENT_VERSION !== "pending-owner-review",
        consent_version: env.CONSENT_VERSION,
      });
    const invitationRoute = url.pathname === "/invitation";
    const method = invitationRoute ? "GET" : "POST";
    if (url.pathname !== "/responses" && !invitationRoute)
      return json(404, { error: "見つかりません。" });
    if (request.method === "OPTIONS") {
      if (request.headers.get("Access-Control-Request-Method") !== method)
        return json(405, { error: "対応していない操作です。" });
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": method,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (request.method !== method)
      return json(405, { error: "対応していない操作です。" });
    const authorization = request.headers.get("Authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match) return json(401, { error: "招待リンクを確認してください。" });
    try {
      const tokenHash = await sha256(match[1]);
      const invitation = await env.DB.prepare(
        "SELECT participant_id FROM invitations WHERE token_hash = ? AND active = 1"
      )
        .bind(tokenHash)
        .first<{ participant_id: string }>();
      if (!invitation)
        return json(401, {
          error: "招待リンクが無効です。担当者へご相談ください。",
        });
      if (invitationRoute) {
        const submitted = await env.DB.prepare(
          "SELECT participant_id FROM responses WHERE participant_id = ?"
        )
          .bind(invitation.participant_id)
          .first<{ participant_id: string }>();
        return json(200, {
          participant_id: invitation.participant_id,
          submitted: Boolean(submitted),
          accepting:
            env.ACCEPTING_RESPONSES === "true" &&
            Boolean(env.CONSENT_VERSION) &&
            env.CONSENT_VERSION !== "pending-owner-review",
          consent_version: env.CONSENT_VERSION,
        });
      }
      if (
        env.ACCEPTING_RESPONSES !== "true" ||
        !env.CONSENT_VERSION ||
        env.CONSENT_VERSION === "pending-owner-review"
      )
        return json(503, { error: "現在は回答を受け付けていません。" });
      if (
        request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
      )
        return json(415, { error: "JSON形式で送信してください。" });
      const reader = request.body?.getReader();
      if (!reader) return json(400, { error: "回答がありません。" });
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return json(413, { error: "回答が大きすぎます。" });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let response;
      try {
        const input = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        );
        if (
          typeof input !== "object" ||
          input === null ||
          Object.keys(input).sort().join(",") !==
            "consent,consent_version,response" ||
          input.consent_version !== env.CONSENT_VERSION
        )
          throw new Error("Consent version mismatch");
        response = validateSubmission({
          consent: input.consent,
          response: input.response,
        });
      } catch {
        return json(400, {
          error: "回答の形式・評点・提示順を確認してください。",
        });
      }
      if (response.participant_id !== invitation.participant_id)
        return json(403, { error: "招待された参加者番号と一致しません。" });
      const body = JSON.stringify(response);
      const hash = await sha256(body);
      // Authorization and exclusive insert are checked in the same SQL statement.
      const inserted = await env.DB.prepare(
        `INSERT INTO responses
        (participant_id, body, body_hash, consent_version, created_at)
        SELECT ?, ?, ?, ?, ? FROM invitations
        WHERE token_hash = ? AND participant_id = ? AND active = 1
        ON CONFLICT(participant_id) DO NOTHING RETURNING participant_id`
      )
        .bind(
          response.participant_id,
          body,
          hash,
          env.CONSENT_VERSION,
          new Date().toISOString(),
          tokenHash,
          response.participant_id
        )
        .first<{ participant_id: string }>();
      if (inserted)
        return json(201, {
          status: "accepted",
          participant_id: response.participant_id,
        });
      const existing = await env.DB.prepare(
        "SELECT body_hash FROM responses WHERE participant_id = ?"
      )
        .bind(response.participant_id)
        .first<{ body_hash: string }>();
      if (existing?.body_hash === hash)
        return json(200, {
          status: "accepted",
          participant_id: response.participant_id,
        });
      if (existing)
        return json(409, {
          error: "この参加者番号は回答済みです。修正は担当者へご相談ください。",
        });
      return json(401, { error: "招待リンクをもう一度確認してください。" });
    } catch {
      // Never log request bodies, authorization, tokens, or error objects.
      return json(503, {
        error: "保存結果を確認できません。同じ内容で再送してください。",
      });
    }
  },
};
