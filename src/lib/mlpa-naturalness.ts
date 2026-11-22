export const checks = [
  ["consent", "研究目的と回答の利用方針を理解し、参加に同意します。"],
  ["reads_japanese", "日本語の文章を読めます。"],
  ["original_unseen", "評価対象の元の原文を読んでいません。"],
  ["independent", "他人や生成AIに相談せず、自分で評価します。"],
  ["first_response", "今回のアンケートへの回答は初めてです。"],
] as const;

export const scale = [
  "とても不自然",
  "やや不自然",
  "意味は通じる",
  "おおむね自然",
  "とても自然",
];
export const storyKeys = ["A", "B"] as const;
export type StoryKey = (typeof storyKeys)[number];

export function isScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

export function hasKeys(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  );
}

export const confirmationKeys = checks.map(([key]) => key);
