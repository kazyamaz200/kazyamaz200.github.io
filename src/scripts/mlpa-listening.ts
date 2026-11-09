import {
  createResponse,
  isParticipant,
  metrics,
  validateSubmission,
  type Response,
} from "@/lib/mlpa-listening";

function setup() {
  const main = document.querySelector<HTMLElement>("main:has(#start-form)");
  if (!main || main.dataset.listeningReady) return;
  main.dataset.listeningReady = "true";
  const controller = new AbortController();
  const { signal } = controller;
  const get = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const input = (id: string) => get<HTMLInputElement>(id);
  const form = (id: string) => get<HTMLFormElement>(id);
  const audio = get<HTMLAudioElement>("audio");
  let response: Response | undefined;
  let index = 0;
  let received = false;
  let sending = false;
  let localReceiver = false;
  let remoteReceiver = false;
  const apiOrigin = (main.dataset.apiUrl ?? "").replace(/\/$/, "");
  const consentVersion = main.dataset.consentVersion ?? "pending-owner-review";
  const invitation = new URLSearchParams(location.hash.slice(1));
  const invitationToken = invitation.get("token") ?? "";
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(invitationToken);
  if (invitationToken) history.replaceState(null, "", location.pathname);
  const sendLabel = () =>
    remoteReceiver ? "回答を送信する" : "テスト回答を送信する";
  const selected: Record<string, string>[] = Array.from(
    { length: 12 },
    () => ({})
  );
  const heard = new Set<number>();
  const names = {
    melodicness: "メロディーらしさ",
    naturalness: "自然さ",
    discomfort: "不快さ",
  };
  const anchors = {
    melodicness:
      "1：メロディーに聞こえない ／ 3：中間 ／ 5：強くメロディーに聞こえる",
    naturalness: "1：不自然 ／ 3：中間 ／ 5：自然",
    discomfort: "1：不快でない ／ 3：中間 ／ 5：非常に不快",
  };
  function error(message: string) {
    const el = get("error");
    el.textContent = message;
    el.hidden = !message;
    if (message) el.focus();
  }
  function show(id: string, focus: string) {
    for (const section of ["intro", "rating", "review", "complete"])
      get(section).hidden = section !== id;
    error("");
    get(focus).focus();
  }
  const participant = invitation.get("participant");
  if (participant && isParticipant(participant))
    input("participant").value = participant;
  // API origin is build-time configuration; invite tokens only live in this closure.
  if (apiOrigin) {
    const startButton = form("start-form").querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!;
    startButton.disabled = true;
    get("data-policy-local").hidden = true;
    get("data-policy-formal").hidden = false;
    if (participant && isParticipant(participant) && validToken)
      input("participant").readOnly = true;
    get("mode").textContent = "受付開始前です。正式な案内をお待ちください。";
    if (
      main.dataset.accepting === "true" &&
      consentVersion !== "pending-owner-review" &&
      validToken &&
      participant &&
      isParticipant(participant)
    ) {
      if (apiOrigin.startsWith("http:") && location.hostname !== "127.0.0.1") {
        error("送信先の設定を確認してください。");
      } else {
        fetch(`${apiOrigin}/invitation`, {
          cache: "no-store",
          signal,
          headers: { Authorization: `Bearer ${invitationToken}` },
        })
          .then(async r => {
            if (!r.ok)
              throw new Error(
                "招待リンクを確認できません。担当者へご相談ください。"
              );
            const status = await r.json();
            if (status.participant_id !== participant)
              throw new Error("招待された参加者番号と一致しません。");
            if (status.submitted)
              throw new Error(
                "この参加者番号は回答済みです。修正・撤回は担当者へご相談ください。"
              );
            remoteReceiver =
              status.accepting === true &&
              status.consent_version === consentVersion;
          })
          .catch(cause =>
            error(
              cause instanceof Error
                ? cause.message
                : "招待リンクを確認できません。"
            )
          )
          .finally(() => {
            get("mode").textContent = remoteReceiver
              ? "招待された参加者向けの試聴評価です。"
              : "現在は回答を受け付けていません。担当者へご相談ください。";
            get<HTMLButtonElement>("send").disabled = !remoteReceiver;
            startButton.disabled = !remoteReceiver;
            get("send").textContent = sendLabel();
          });
      }
    } else if (main.dataset.accepting === "true") {
      get("mode").textContent =
        "担当者から受け取った招待リンクを開いてください。";
    }
  } else if (location.hostname === "127.0.0.1") {
    fetch("/api/mlpa-listening/config", { cache: "no-store", signal })
      .then(async r => {
        if (r.ok) localReceiver = (await r.json()).mode === "local-test";
      })
      .catch(() => {})
      .finally(() => {
        get("mode").textContent = localReceiver
          ? "ローカル動作確認版 — 正式評価ではありません。回答はこの作業端末にだけ保存されます。"
          : "送信先が未設定です。試聴画面は確認できますが、回答は送信できません。";
        get<HTMLButtonElement>("send").disabled = !localReceiver;
      });
  } else
    get("mode").textContent =
      "公開準備中 — 正式評価・回答送信は開始していません。";

  function renderClip() {
    if (!response) return;
    audio.pause();
    audio.src = `/assets/mlpa-listening/${response.ratings[index].audio_id}.wav`;
    audio.load();
    get("clip-title").textContent = `音声 ${index + 1} / 12`;
    get("progress").textContent =
      `参加者 ${response.participant_id} · ${selected.filter(x => metrics.every(m => Object.hasOwn(x, m))).length} / 12 音声回答済み`;
    get<HTMLProgressElement>("progress-bar").value = selected.filter(x =>
      metrics.every(m => Object.hasOwn(x, m))
    ).length;
    get("audio-status").textContent = heard.has(index)
      ? "この音声は最後まで再生済みです。再聴できます。"
      : "まだ最後まで再生していません。";
    const scales = get("scales");
    scales.replaceChildren();
    for (const metric of metrics) {
      const field = document.createElement("fieldset");
      field.className = "listening-scale";
      const legend = document.createElement("legend");
      legend.textContent = names[metric];
      const anchor = document.createElement("p");
      anchor.textContent = anchors[metric];
      anchor.id = `anchor-${metric}`;
      const hint = document.createElement("p");
      hint.textContent = "2と4は隣接する基準の間です。";
      field.setAttribute("aria-describedby", anchor.id);
      const choices = document.createElement("div");
      choices.className = "scale-choices";
      for (const value of ["1", "2", "3", "4", "5", "unknown"]) {
        const label = document.createElement("label");
        label.className = "scale-choice";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = metric;
        radio.value = value;
        radio.required = true;
        radio.checked = selected[index][metric] === value;
        radio.addEventListener(
          "change",
          () => {
            selected[index][metric] = value;
          },
          { signal }
        );
        label.append(
          radio,
          document.createTextNode(value === "unknown" ? "判断できない" : value)
        );
        choices.append(label);
      }
      field.append(legend, anchor, hint, choices);
      scales.append(field);
    }
    input("listen-count").value =
      response.ratings[index].listen_count?.toString() ?? "";
    get<HTMLTextAreaElement>("comment").value = response.ratings[index].comment;
    get<HTMLButtonElement>("previous").disabled = index === 0;
    get("next").textContent = index === 11 ? "回答を確認する" : "回答して次へ";
    show("rating", "clip-title");
  }
  function saveClip() {
    if (!response) return;
    const row = response.ratings[index];
    for (const m of metrics)
      row[m] =
        selected[index][m] === "unknown" ? null : Number(selected[index][m]);
    const count = input("listen-count").value;
    row.listen_count = count === "" ? null : Number(count);
    row.comment = get<HTMLTextAreaElement>("comment").value;
  }
  function review() {
    if (!response) return;
    audio.pause();
    const summary = get("summary");
    summary.replaceChildren();
    for (const [i, row] of response.ratings.entries()) {
      const section = document.createElement("div");
      section.className = "review-row";
      const title = document.createElement("h3");
      title.textContent = `音声 ${i + 1}`;
      const p = document.createElement("p");
      p.textContent = metrics
        .map(
          m =>
            `${names[m]}：${!Object.hasOwn(selected[i], m) ? "未選択" : (row[m] ?? "判断できない")}`
        )
        .join(" ／ ");
      const comment = document.createElement("p");
      comment.textContent = row.comment
        ? `コメント：${row.comment}`
        : "コメントなし";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = `音声 ${i + 1} を見直す`;
      edit.addEventListener(
        "click",
        () => {
          index = i;
          renderClip();
        },
        { signal }
      );
      section.append(title, p, comment, edit);
      summary.append(section);
    }
    show("review", "review-title");
  }
  form("start-form").addEventListener(
    "submit",
    e => {
      e.preventDefault();
      const id = input("participant").value.trim().toUpperCase();
      if (!input("consent").checked || !isParticipant(id))
        return error("同意と割り当てられた参加者番号を確認してください。");
      response = createResponse(id);
      const dev = get<HTMLSelectElement>("developer").value;
      response.is_developer = dev === "" ? null : dev === "true";
      response.playback_output = (get<HTMLSelectElement>("output").value ||
        null) as Response["playback_output"];
      renderClip();
    },
    { signal }
  );
  audio.addEventListener(
    "ended",
    () => {
      heard.add(index);
      get("audio-status").textContent = "最後まで再生しました。再聴できます。";
    },
    { signal }
  );
  audio.addEventListener(
    "error",
    () =>
      error(
        "音声を読み込めませんでした。通信と再生機器を確認して、再読み込みしてください。入力中の回答は再読み込みで失われます。"
      ),
    { signal }
  );
  form("rating-form").addEventListener(
    "submit",
    e => {
      e.preventDefault();
      if (!metrics.every(m => Object.hasOwn(selected[index], m)))
        return error("3つの指標を選んでください。");
      if (!heard.has(index))
        return error("音声を最後まで聴いてから進んでください。");
      saveClip();
      if (index < 11) {
        index++;
        renderClip();
      } else review();
    },
    { signal }
  );
  get("previous").addEventListener(
    "click",
    () => {
      saveClip();
      index--;
      renderClip();
    },
    { signal }
  );
  form("submit-form").addEventListener(
    "submit",
    async e => {
      e.preventDefault();
      if (!response || sending || received) return;
      if (!localReceiver && !remoteReceiver)
        return error("現在は回答を送信できません。担当者へご相談ください。");
      if (
        !selected.every(x => metrics.every(m => Object.hasOwn(x, m))) ||
        heard.size !== 12
      )
        return error("未選択または未再生の音声があります。");
      response.fatigue_comment = get<HTMLTextAreaElement>("fatigue").value;
      response.completed_by_human = input("human").checked;
      try {
        validateSubmission({ consent: true, response });
      } catch (cause) {
        return error(
          cause instanceof Error ? cause.message : "回答を確認してください。"
        );
      }
      error("");
      sending = true;
      get<HTMLButtonElement>("send").disabled = true;
      get("send").textContent = "保存中…";
      try {
        const result = await fetch(
          remoteReceiver
            ? `${apiOrigin}/responses`
            : "/api/mlpa-listening/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(remoteReceiver
                ? { Authorization: `Bearer ${invitationToken}` }
                : {}),
            },
            body: JSON.stringify({
              consent: true,
              ...(remoteReceiver ? { consent_version: consentVersion } : {}),
              response,
            }),
            signal: AbortSignal.timeout(10000),
          }
        );
        const receipt = await result.json();
        if (!result.ok)
          throw new Error(receipt.error ?? "保存できませんでした。");
        if (
          receipt.status !== "accepted" ||
          receipt.participant_id !== response.participant_id
        )
          throw new Error(
            "保存結果を確認できません。同じ内容で再送してください。"
          );
        received = true;
        get("receipt").textContent =
          `参加者 ${response.participant_id} · 12音声のテスト回答を保存しました。`;
        if (remoteReceiver) {
          get("complete-title").textContent = "回答を受け付けました";
          get("receipt").textContent =
            `参加者 ${response.participant_id} · 12音声の回答を受け付けました。`;
          get("completion-message").textContent =
            "ご協力ありがとうございました。回答の修正や撤回については、招待時の連絡経路から担当者へご相談ください。";
        }
        show("complete", "complete-title");
      } catch (cause) {
        error(
          cause instanceof TypeError ||
            (cause instanceof DOMException && cause.name === "TimeoutError")
            ? "通信できませんでした。回答はこの画面に残っています。同じ内容で再送できます。"
            : cause instanceof Error
              ? `${cause.message} 回答はこの画面に残っています。`
              : "保存できませんでした。同じ内容で再送できます。"
        );
      } finally {
        sending = false;
        get<HTMLButtonElement>("send").disabled = false;
        get("send").textContent = sendLabel();
      }
    },
    { signal }
  );
  get("download").addEventListener(
    "click",
    () => {
      if (!received || !response) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(response, null, 2) + "\n"], {
          type: "application/json",
        })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${response.participant_id}.responses.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    { signal }
  );
  window.addEventListener(
    "beforeunload",
    e => {
      if (response && !received) {
        e.preventDefault();
      }
    },
    { signal }
  );
  document.addEventListener(
    "astro:before-swap",
    () => {
      audio.pause();
      controller.abort();
    },
    { once: true, signal }
  );
}
setup();
document.addEventListener("astro:page-load", setup);
