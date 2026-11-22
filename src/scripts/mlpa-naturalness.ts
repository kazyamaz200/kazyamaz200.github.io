import { checks, isScore, scale, storyKeys } from "@/lib/mlpa-naturalness";

async function setup() {
  const main = document.querySelector<HTMLElement>("[data-naturalness]");
  if (!main?.dataset.api) return;
  const api = new URL(main.dataset.api);
  const test = main.dataset.test === "true";
  if (
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash ||
    !(
      api.protocol === "https:" ||
      (test && api.protocol === "http:" && api.hostname === "127.0.0.1")
    )
  )
    return;
  const get = <T extends HTMLElement>(id: string) =>
    document.querySelector<T>(`#naturalness-${id}`)!;
  const form = get<HTMLFormElement>("form");
  const intro = get("intro");
  const ratings = get("ratings");
  const confirm = get("confirm");
  const complete = get("complete");
  const status = get("status");
  const error = get("error");
  const send = get<HTMLButtonElement>("send");
  const back = get<HTMLButtonElement>("back");
  let survey: {
    mode: "test" | "formal";
    stories: Record<"A" | "B", string>;
    policy: Record<string, string>;
    survey_version: string;
    presentation_sha256: string;
  };
  try {
    const response = await fetch(new URL("/survey", api), {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 503) {
      status.textContent = "現在は回答を受け付けていません。";
      return;
    }
    if (!response.ok) throw new Error("survey unavailable");
    survey = await response.json();
    if (survey.mode !== (test ? "test" : "formal"))
      throw new Error("mode mismatch");
    const texts = storyKeys.map(key => survey.stories[key]);
    if (!texts.every(value => typeof value === "string" && value.trim()))
      throw new Error("missing texts");
    const sum = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(texts))
    );
    const hash = Array.from(new Uint8Array(sum), value =>
      value.toString(16).padStart(2, "0")
    ).join("");
    if (hash !== survey.presentation_sha256)
      throw new Error("presentation mismatch");
    for (const field of main.querySelectorAll<HTMLElement>("[data-policy]")) {
      const value = survey.policy[field.dataset.policy!];
      if (typeof value !== "string" || !value.trim())
        throw new Error("missing policy");
      field.textContent = value;
    }
  } catch {
    status.textContent =
      "評価ページを読み込めませんでした。通信を確認してページを開き直してください。";
    return;
  }
  status.textContent = test
    ? "動作確認用。表示される文章と送信内容はテスト用です。"
    : "回答を受け付けています。";
  form.hidden = false;

  function show(section: HTMLElement) {
    for (const panel of [intro, ratings, confirm, complete])
      panel.hidden = panel !== section;
    section.querySelector<HTMLElement>("h2")?.focus();
    error.textContent = "";
  }
  const responseId = crypto.randomUUID();
  const checked = () =>
    checks.every(
      ([key]) =>
        form.querySelector<HTMLInputElement>(`[name="${key}"]`)!.checked
    );
  function getScores() {
    const values = new FormData(form);
    return { A: Number(values.get("A")), B: Number(values.get("B")) };
  }
  get("start").addEventListener("click", () => {
    if (!checked()) {
      error.textContent = "参加確認の5項目すべてにチェックしてください。";
      form
        .querySelector<HTMLInputElement>('input[type="checkbox"]:not(:checked)')
        ?.focus();
      return;
    }
    for (const key of storyKeys)
      main.querySelector<HTMLElement>(`[data-story="${key}"]`)!.textContent =
        survey.stories[key];
    show(ratings);
  });
  get("review").addEventListener("click", () => {
    const scores = getScores();
    const missing = storyKeys.find(key => !isScore(scores[key]));
    if (missing) {
      error.textContent = "文章Aと文章Bの両方を評価してください。";
      form.querySelector<HTMLInputElement>(`[name="${missing}"]`)?.focus();
      return;
    }
    get("summary").textContent = storyKeys
      .map(key => `文章${key}　${scores[key]}（${scale[scores[key] - 1]}）`)
      .join(" ／ ");
    show(confirm);
  });
  back.addEventListener("click", () => show(ratings));

  let payload: string | undefined;
  let sending = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (confirm.hidden || sending || send.disabled) return;
    const scores = getScores();
    if (!checked() || !isScore(scores.A) || !isScore(scores.B)) return;
    payload ??= JSON.stringify({
      response_id: responseId,
      survey_version: survey.survey_version,
      presentation_sha256: survey.presentation_sha256,
      confirmations: Object.fromEntries(checks.map(([key]) => [key, true])),
      scores,
    });
    sending = true;
    send.disabled = true;
    back.disabled = true;
    let retry = true;
    error.textContent = "送信中です。";
    try {
      const response = await fetch(new URL("/responses", api), {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (
        response.status === 503 ||
        (response.status === 409 && result.error === "survey_changed")
      ) {
        retry = false;
        error.textContent =
          response.status === 503
            ? "受付が終了したため、回答は保存されませんでした。"
            : "表示内容が更新されたため、回答は保存されませんでした。ページを開き直してください。";
        return;
      }
      if (response.status < 500 && !response.ok) {
        retry = false;
        error.textContent =
          "回答を受け付けられませんでした。再送せず、表示された問い合わせ先にご相談ください。";
        return;
      }
      if (
        ![200, 201].includes(response.status) ||
        result.response_id !== responseId ||
        typeof result.submitted_at !== "string"
      )
        throw new Error("unconfirmed");
      retry = false;
      form.hidden = true;
      status.textContent = test ? "テスト回答を保存しました。" : "";
      get("receipt").textContent = `回答ID　${responseId}`;
      show(complete);
    } catch {
      error.textContent =
        "保存を確認できませんでした。この画面の「回答を送信する」で、同じ回答を再送できます。";
    } finally {
      sending = false;
      send.disabled = !retry;
    }
  });
}

void setup();
