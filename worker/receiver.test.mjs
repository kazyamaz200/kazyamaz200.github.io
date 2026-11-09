import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { createResponse } from "../src/lib/mlpa-listening.ts";
import { DatabaseSync } from "node:sqlite";
const dir = import.meta.dirname,
  cli = resolve(dir, "node_modules/wrangler/bin/wrangler.js");
const payload = id => {
  const r = createResponse(id);
  r.completed_by_human = true;
  r.fatigue_comment = "Synthetic API test";
  for (const x of r.ratings)
    Object.assign(x, { melodicness: 3, naturalness: null, discomfort: 1 });
  return { consent: true, consent_version: "synthetic-test-v1", response: r };
};
test("real workerd and D1", async t => {
  const tmp = await mkdtemp(join(tmpdir(), "mlpa-worker-")),
    state = join(tmp, "state"),
    config = join(tmp, "wrangler.json");
  const origin = "http://127.0.0.1:4340",
    base = "http://127.0.0.1:8787";
  const tokens = {
    P01: randomBytes(32).toString("base64url"),
    P02: randomBytes(32).toString("base64url"),
  };
  const conf = {
    name: "mlpa-local-test",
    main: resolve(dir, "index.ts"),
    compatibility_date: "2026-11-09",
    observability: { enabled: false },
    vars: {
      ALLOWED_ORIGIN: origin,
      ACCEPTING_RESPONSES: "true",
      CONSENT_VERSION: "synthetic-test-v1",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "mlpa-local",
        database_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
  };
  const env = {
    ...process.env,
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(tmp, "wrangler.log"),
    NO_COLOR: "1",
  };
  let child;
  async function start() {
    child = spawn(
      process.execPath,
      [
        cli,
        "dev",
        "--local",
        "--port",
        "8787",
        "--ip",
        "127.0.0.1",
        "--persist-to",
        state,
        "--config",
        config,
      ],
      { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }
    );
    let output = "";
    child.stdout.on("data", d => (output += d));
    child.stderr.on("data", d => (output += d));
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(base + "/status", { headers: { Origin: origin } })).ok)
          return;
      } catch {}
      if (child.exitCode !== null) throw Error(output);
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error(output);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const p = new Promise(r => child.once("exit", r));
      child.kill("SIGTERM");
      await p;
    }
  }
  const post = (p, token = tokens.P01, headers = {}) =>
    fetch(base + "/responses", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        ...headers,
      },
      body: JSON.stringify(p),
    });
  try {
    await writeFile(config, JSON.stringify(conf));
    const schema = await readFile(
      resolve(dir, "migrations/0001_listening.sql"),
      "utf8"
    );
    const sql = join(tmp, "setup.sql");
    await writeFile(
      sql,
      schema +
        Object.entries(tokens)
          .map(
            ([id, token]) =>
              `\nINSERT INTO invitations VALUES ('${id}','${createHash("sha256").update(token).digest("hex")}',1);`
          )
          .join("")
    );
    const run = spawnSync(
      process.execPath,
      [
        cli,
        "d1",
        "execute",
        "DB",
        "--local",
        "--persist-to",
        state,
        "--config",
        config,
        "--file",
        sql,
      ],
      { env, cwd: dir, encoding: "utf8" }
    );
    assert.equal(run.status, 0, run.stderr + run.stdout);
    await start();
    await t.test(
      "invite preflight validates token before listening",
      async () => {
        assert.equal(
          (await fetch(base + "/invitation", { headers: { Origin: origin } }))
            .status,
          401
        );
        const pre = await fetch(base + "/invitation", {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
        });
        assert.equal(pre.status, 204);
        const reply = await fetch(base + "/invitation", {
          headers: { Origin: origin, Authorization: "Bearer " + tokens.P01 },
        });
        assert.deepEqual(await reply.json(), {
          participant_id: "P01",
          submitted: false,
          accepting: true,
          consent_version: "synthetic-test-v1",
        });
      }
    );
    await t.test("origin/auth/preflight/validation", async () => {
      assert.equal(
        (
          await post(payload("P01"), tokens.P01, {
            Origin: "https://foreign.example",
          })
        ).status,
        403
      );
      const pre = await fetch(base + "/responses", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get("access-control-allow-origin"), origin);
      assert.equal((await post(payload("P01"), "x".repeat(43))).status, 401);
      assert.equal((await post(payload("P02"))).status, 403);
      const outdated = payload("P01");
      outdated.consent_version = "outdated";
      assert.equal((await post(outdated)).status, 400);
      const bad = payload("P01");
      bad.response.ratings[0].melodicness = 6;
      assert.equal((await post(bad)).status, 400);
      assert.equal(
        (await post({ ...payload("P01"), extra: "x".repeat(66000) })).status,
        413
      );
    });
    await t.test(
      "concurrent unique insert and idempotent retries",
      async () => {
        const a = payload("P01"),
          b = payload("P01");
        b.response.ratings[0].melodicness = 5;
        assert.deepEqual(
          (
            await Promise.all(
              [post(a), post(b)].map(async p => (await p).status)
            )
          ).sort(),
          [201, 409]
        );
        const ra = await post(a),
          rb = await post(b);
        assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
        const chosen = ra.status === 200 ? a : b;
        chosen.response.ratings = chosen.response.ratings.map(x =>
          Object.fromEntries(Object.entries(x).reverse())
        );
        assert.equal((await post(chosen)).status, 200);
        assert.equal((await post(payload("P02"), tokens.P02)).status, 201);
        const known = await fetch(base + "/invitation", {
          headers: { Origin: origin, Authorization: "Bearer " + tokens.P01 },
        });
        assert.equal((await known.json()).submitted, true);
      }
    );
    await stop();
    await t.test(
      "D1 migration preserves old answers and invites while adding participants",
      async () => {
        let dbPath;
        for (const file of (await readdir(state, { recursive: true })).filter(
          x => x.endsWith(".sqlite")
        )) {
          const db = new DatabaseSync(join(state, file), { readOnly: true });
          try {
            db.prepare("SELECT * FROM responses").all();
            dbPath = join(state, file);
          } catch {
          } finally {
            db.close();
          }
        }
        assert(dbPath);
        const beforeDb = new DatabaseSync(dbPath, { readOnly: true });
        const beforeRows = beforeDb
          .prepare("SELECT * FROM responses ORDER BY participant_id")
          .all();
        const beforeInvites = beforeDb
          .prepare("SELECT * FROM invitations ORDER BY participant_id")
          .all();
        beforeDb.close();
        const migration = resolve(
          dir,
          "migrations/0002_add_two_participants.sql"
        );
        const applied = spawnSync(
          process.execPath,
          [
            cli,
            "d1",
            "execute",
            "DB",
            "--local",
            "--persist-to",
            state,
            "--config",
            config,
            "--file",
            migration,
          ],
          { env, cwd: dir, encoding: "utf8" }
        );
        assert.equal(applied.status, 0, applied.stderr + applied.stdout);
        const afterDb = new DatabaseSync(dbPath, { readOnly: true });
        assert.deepEqual(
          afterDb
            .prepare("SELECT * FROM responses ORDER BY participant_id")
            .all(),
          beforeRows
        );
        assert.deepEqual(
          afterDb
            .prepare("SELECT * FROM invitations ORDER BY participant_id")
            .all(),
          beforeInvites
        );
        assert.deepEqual(afterDb.prepare("PRAGMA foreign_key_check").all(), []);
        afterDb.close();
      }
    );
    await t.test(
      "independent SQLite reader verifies WP06 JSON and hashed tokens",
      async () => {
        let found = false;
        for (const file of (await readdir(state, { recursive: true })).filter(
          x => x.endsWith(".sqlite")
        )) {
          const db = new DatabaseSync(join(state, file), { readOnly: true });
          try {
            const rows = db
              .prepare(
                "SELECT participant_id,body,consent_version FROM responses"
              )
              .all();
            assert.equal(rows.length, 2);
            for (const row of rows) {
              const r = JSON.parse(row.body);
              assert.deepEqual(
                Object.keys(r),
                Object.keys(createResponse(row.participant_id))
              );
              assert.equal(r.ratings.length, 12);
              assert.equal(r.ratings[0].naturalness, null);
              assert.equal(row.consent_version, "synthetic-test-v1");
            }
            for (const row of db
              .prepare("SELECT token_hash FROM invitations")
              .all())
              assert.match(row.token_hash, /^[a-f0-9]{64}$/);
            found = true;
          } catch (e) {
            if (!e.message.includes("no such table")) throw e;
          } finally {
            db.close();
          }
        }
        assert(found);
      }
    );
    tokens.P06 = randomBytes(32).toString("base64url");
    tokens.P07 = randomBytes(32).toString("base64url");
    const extraSql = join(tmp, "extra.sql");
    await writeFile(
      extraSql,
      ["P06", "P07"]
        .map(
          id =>
            `INSERT INTO invitations VALUES ('${id}','${createHash("sha256").update(tokens[id]).digest("hex")}',1);`
        )
        .join("\n")
    );
    const seeded = spawnSync(
      process.execPath,
      [
        cli,
        "d1",
        "execute",
        "DB",
        "--local",
        "--persist-to",
        state,
        "--config",
        config,
        "--file",
        extraSql,
      ],
      { env, cwd: dir, encoding: "utf8" }
    );
    assert.equal(seeded.status, 0, seeded.stderr + seeded.stdout);
    await start();
    await t.test(
      "additional P06/P07 can authenticate, submit, and export",
      async () => {
        for (const id of ["P06", "P07"]) {
          const r = await fetch(base + "/invitation", {
            headers: { Origin: origin, Authorization: "Bearer " + tokens[id] },
          });
          assert.equal((await r.json()).participant_id, id);
          assert.equal((await post(payload(id), tokens[id])).status, 201);
        }
        const { responseFiles } = await import("./operator.mjs");
        assert.deepEqual(
          responseFiles(
            ["P06", "P07"].map(id => ({
              participant_id: id,
              body: JSON.stringify(payload(id).response),
            }))
          ).map(x => x.name),
          ["P06.responses.json", "P07.responses.json"]
        );
      }
    );
    await stop();
    conf.vars.ACCEPTING_RESPONSES = "false";
    await writeFile(config, JSON.stringify(conf));
    await start();
    await t.test("closed gate and absence of public read/export", async () => {
      assert.equal(
        (
          await (
            await fetch(base + "/status", { headers: { Origin: origin } })
          ).json()
        ).accepting,
        false
      );
      assert.equal((await post(payload("P01"))).status, 503);
      assert.equal(
        (await fetch(base + "/export", { headers: { Origin: origin } })).status,
        404
      );
    });
  } finally {
    await stop();
    await rm(tmp, { recursive: true, force: true });
  }
});

test("operator: private invitations are unpredictable and exports stay WP06-compatible", async () => {
  const { generateInvitations, responseFiles } = await import("./operator.mjs");
  const invitations = generateInvitations();
  assert.equal(invitations.length, 7);
  assert.equal(new Set(invitations.map(x => x.token)).size, 7);
  assert.deepEqual(
    generateInvitations(["P06", "P07"]).map(x => x.participant_id),
    ["P06", "P07"]
  );
  assert.throws(() => generateInvitations(["P06", "P06"]));
  for (const x of invitations) {
    assert.match(x.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(
      x.token_hash,
      createHash("sha256").update(x.token).digest("hex")
    );
  }
  const files = responseFiles([
    { participant_id: "P01", body: JSON.stringify(payload("P01").response) },
  ]);
  assert.equal(files[0].name, "P01.responses.json");
  assert.deepEqual(JSON.parse(files[0].body), payload("P01").response);
});
