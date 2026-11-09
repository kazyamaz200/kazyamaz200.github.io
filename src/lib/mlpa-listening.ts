import orders from "./mlpa-listening-orders.json" with { type: "json" };

export const metrics = ["melodicness", "naturalness", "discomfort"] as const;
export type Participant = keyof typeof orders;
export type Rating = {
  audio_id: string;
  presentation_order: number;
  melodicness: number | null;
  naturalness: number | null;
  discomfort: number | null;
  listen_count: number | null;
  comment: string;
};
export type Response = {
  participant_id: Participant;
  completed_by_human: boolean;
  is_developer: boolean | null;
  playback_output: "headphones" | "speakers" | "other" | null;
  fatigue_comment: string;
  ratings: Rating[];
};
export const participantIds = Object.keys(orders) as Participant[];
export function isParticipant(id: string): id is Participant {
  return Object.hasOwn(orders, id);
}
export function createResponse(id: Participant): Response {
  return {
    participant_id: id,
    completed_by_human: false,
    is_developer: null,
    playback_output: null,
    fatigue_comment: "",
    ratings: orders[id].map((audio_id, i) => ({
      audio_id,
      presentation_order: i + 1,
      melodicness: null,
      naturalness: null,
      discomfort: null,
      listen_count: null,
      comment: "",
    })),
  };
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function comment(value: unknown): boolean {
  return typeof value === "string" && value.length <= 1000;
}
export function validateSubmission(input: unknown): Response {
  if (
    !object(input) ||
    !keys(input, ["consent", "response"]) ||
    input.consent !== true
  )
    throw new Error("参加同意を確認してください。");
  const r = input.response;
  if (
    !object(r) ||
    !keys(r, [
      "participant_id",
      "completed_by_human",
      "is_developer",
      "playback_output",
      "fatigue_comment",
      "ratings",
    ])
  )
    throw new Error("回答の形式が正しくありません。");
  if (typeof r.participant_id !== "string" || !isParticipant(r.participant_id))
    throw new Error("割り当てられた参加者番号を確認してください。");
  if (
    r.completed_by_human !== true ||
    ![true, false, null].includes(r.is_developer as boolean | null) ||
    ![null, "headphones", "speakers", "other"].includes(
      r.playback_output as string | null
    ) ||
    !comment(r.fatigue_comment)
  )
    throw new Error("回答の確認欄を確認してください。");
  if (!Array.isArray(r.ratings) || r.ratings.length !== 12)
    throw new Error("12音声すべての回答が必要です。");
  for (const [i, row] of r.ratings.entries()) {
    if (
      !object(row) ||
      !keys(row, [
        "audio_id",
        "presentation_order",
        ...metrics,
        "listen_count",
        "comment",
      ]) ||
      row.audio_id !== orders[r.participant_id][i] ||
      row.presentation_order !== i + 1
    )
      throw new Error("音声と提示順が一致しません。");
    if (
      !metrics.every(
        m =>
          row[m] === null ||
          (typeof row[m] === "number" &&
            Number.isInteger(row[m]) &&
            row[m] >= 1 &&
            row[m] <= 5)
      )
    )
      throw new Error(
        "評点は1〜5の整数、判断できない場合はnullにしてください。"
      );
    if (
      !(
        row.listen_count === null ||
        (Number.isSafeInteger(row.listen_count) &&
          (row.listen_count as number) >= 1)
      ) ||
      !comment(row.comment)
    )
      throw new Error("再聴回数またはコメントを確認してください。");
  }
  // Only protocol-defined keys survive; canonical order also makes retries stable.
  const result = createResponse(r.participant_id);
  result.completed_by_human = true;
  result.is_developer = r.is_developer as boolean | null;
  result.playback_output = r.playback_output as Response["playback_output"];
  result.fatigue_comment = r.fatigue_comment as string;
  result.ratings = (r.ratings as Rating[]).map(row => ({
    audio_id: row.audio_id,
    presentation_order: row.presentation_order,
    melodicness: row.melodicness,
    naturalness: row.naturalness,
    discomfort: row.discomfort,
    listen_count: row.listen_count,
    comment: row.comment,
  }));
  return result;
}
