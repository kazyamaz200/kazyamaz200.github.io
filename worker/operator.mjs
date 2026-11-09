// Operator only: never import into the Worker or the public client.
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { resolve, sep, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  participantIds,
  isParticipant,
  validateSubmission,
} from "../src/lib/mlpa-listening.ts";
const directory = fileURLToPath(new URL(".", import.meta.url));
const repository = resolve(directory, "..");
export function generateInvitations(ids = participantIds) {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    !ids.every(isParticipant)
  )
    throw Error("Invalid participant selection");
  return ids.map(id => {
    const token = randomBytes(32).toString("base64url");
    return {
      participant_id: id,
      token,
      token_hash: createHash("sha256").update(token).digest("hex"),
    };
  });
}
export function responseFiles(rows) {
  return rows.map(row => {
    const response = validateSubmission({
      consent: true,
      response: JSON.parse(row.body),
    });
    if (response.participant_id !== row.participant_id)
      throw Error("Participant mismatch");
    return {
      name: response.participant_id + ".responses.json",
      body: JSON.stringify(response, null, 2) + "\n",
    };
  });
}
async function main() {
  const [action, outputArg, configArg, mode, ...ids] = process.argv.slice(2);
  if (
    !["issue", "export"].includes(action) ||
    !outputArg ||
    !configArg ||
    !["local", "remote"].includes(mode)
  )
    throw Error(
      "Usage: operator.mjs issue|export <PRIVATE-output-dir> <config-path> local|remote"
    );
  const output = resolve(outputArg);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const actual = await realpath(output),
    repoActual = await realpath(repository);
  if (actual === repoActual || actual.startsWith(repoActual + sep))
    throw Error("Private output must be outside the public repository");
  const config = resolve(configArg);
  const cli = resolve(directory, "node_modules/wrangler/bin/wrangler.js");
  const execute = sql => {
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "d1",
        "execute",
        "DB",
        "--config",
        config,
        "--" + mode,
        "--json",
        "--command",
        sql,
      ],
      {
        cwd: directory,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        encoding: "utf8",
      }
    );
    if (r.status !== 0)
      throw Error(
        "D1 operation failed; review private Wrangler logs. No credentials or responses printed."
      );
    return JSON.parse(r.stdout);
  };
  if (action === "issue") {
    const invitations = generateInvitations(ids.length ? ids : participantIds);
    const destination = join(actual, "invitations.json");
    // Persist once before modifying remote state, so an interrupted request is recoverable.
    await writeFile(
      destination,
      JSON.stringify(
        invitations.map(x => ({
          participant_id: x.participant_id,
          url:
            "https://kazyamaz200.github.io/mlpa-listening/#" +
            new URLSearchParams({
              participant: x.participant_id,
              token: x.token,
            }),
        })),
        null,
        2
      ) + "\n",
      { flag: "wx", mode: 0o600 }
    );
    const sql =
      "INSERT INTO invitations(participant_id,token_hash) VALUES " +
      invitations
        .map(x => `('${x.participant_id}','${x.token_hash}')`)
        .join(",") +
      ";";
    // Existing invitations cause an error; never silently rotate or overwrite.
    try {
      execute(sql);
    } catch (error) {
      throw Error(
        error.message +
          " Keep private invitations.json until the remote result is reconciled."
      );
    }
    process.stdout.write(
      "Invitations saved in the private output directory. Treat URLs as credentials.\n"
    );
  } else {
    const result = execute(
      "SELECT participant_id,body FROM responses ORDER BY participant_id"
    );
    const rows = result.flatMap(x => x.results ?? []);
    const files = responseFiles(rows);
    for (const file of files)
      await writeFile(join(actual, file.name), file.body, {
        flag: "wx",
        mode: 0o600,
      });
    process.stdout.write(
      `Exported ${files.length} response files to the private output directory.\n`
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    process.stderr.write(
      "Operator operation failed. Reconcile existing private files and D1 state before retrying. No data overwritten.\n"
    );
    process.exitCode = 1;
  });
