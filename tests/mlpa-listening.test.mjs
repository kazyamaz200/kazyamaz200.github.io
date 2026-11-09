import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createResponse,
  validateSubmission,
  participantIds,
} from "../src/lib/mlpa-listening.ts";
import { createLocalServer } from "../scripts/mlpa-listening-local.mjs";
const good = (id = "P01") => {
  const r = createResponse(id);
  r.completed_by_human = true;
  for (const row of r.ratings)
    Object.assign(row, { melodicness: 1, naturalness: 3, discomfort: 5 });
  return { consent: true, response: r };
};

test("all assigned orders accept integers and explicit unknown; canonical WP06 keys", () => {
  for (const id of participantIds) {
    const body = good(id);
    body.response.ratings[0].melodicness = null;
    assert.deepEqual(validateSubmission(body), body.response);
  }
});
test("invalid scores, missing fields, duplicates, wrong order and extra data are rejected", () => {
  for (const bad of [0, 6, 1.5, "3", true, undefined]) {
    const b = good();
    b.response.ratings[0].melodicness = bad;
    assert.throws(() => validateSubmission(b));
  }
  for (const edit of [
    b => (b.consent = false),
    b => (b.response.completed_by_human = false),
    b => (b.response.participant_id = "P08"),
    b => b.response.ratings.pop(),
    b => b.response.ratings.reverse(),
    b => (b.response.ratings[0].audio_id = "S99"),
    b => (b.response.email = "unwanted"),
    b => (b.response.ratings[0].listen_count = 0),
    b => (b.response.ratings[0].listen_count = 1.5),
    b => (b.response.fatigue_comment = "x".repeat(1001)),
    b => (b.response.is_developer = "false"),
    b => (b.response.playback_output = "bluetooth"),
  ]) {
    const b = good();
    edit(b);
    assert.throws(() => validateSubmission(b));
  }
});
test("real local receiver: validation, same/different retries, concurrency, export, isolation", async () => {
  const temp = await mkdtemp(join(tmpdir(), "mlpa-contract-"));
  const server = createLocalServer({
    root: join(temp, "dist"),
    dataDir: join(temp, "private"),
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) =>
    fetch(base + "/api/mlpa-listening/responses", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post(good(), { Origin: "https://untrusted.example" })).status,
      403
    );
    assert.equal(
      (await post(good(), { "Content-Type": "text/plain" })).status,
      415
    );
    const bad = good();
    delete bad.response.ratings[0].naturalness;
    assert.equal((await post(bad)).status, 400);
    assert.equal(
      (await post({ ...good(), padding: "x".repeat(66000) })).status,
      413
    );
    const a = good(),
      b = good();
    b.response.ratings[0].melodicness = 5;
    const statuses = await Promise.all(
      [post(a), post(b)].map(async r => (await r).status)
    );
    assert.deepEqual(statuses.sort(), [201, 409]);
    const stored = JSON.parse(
      await readFile(join(temp, "private/P01.responses.json"), "utf8")
    );
    const chosen = stored.ratings[0].melodicness === 1 ? a : b;
    assert.deepEqual(stored, chosen.response);
    assert.equal((await post(chosen)).status, 200);
    const reordered = structuredClone(chosen);
    reordered.response.ratings = reordered.response.ratings.map(row =>
      Object.fromEntries(Object.entries(row).reverse())
    );
    assert.equal((await post(reordered)).status, 200);
    assert.equal((await fetch(base + "/P01.responses.json")).status, 404);
    assert.equal(
      (await fetch(base + "/api/mlpa-listening/responses")).status,
      404
    );
    assert.deepEqual(await readdir(join(temp, "private")), [
      "P01.responses.json",
    ]);
  } finally {
    await new Promise(r => server.close(r));
    await rm(temp, { recursive: true, force: true });
  }
});
