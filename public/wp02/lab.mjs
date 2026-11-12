const mode = new URLSearchParams(location.search).get("mode");
const status = document.querySelector("#status");
const trial = document.querySelector("#trial");
const result = document.querySelector("#result");
const controls = document.querySelector("#controls");
const download = document.querySelector("#download");
const records = [];

function update(message) {
    status.textContent = message;
}

function record(report) {
    records.push(report);
    result.textContent = JSON.stringify(report, null, 2);
    download.disabled = false;
}

function begin() {
    return {trialId: trial.value.trim(), mode, startedUtc: new Date().toISOString(),
        userAgent: navigator.userAgent, secureContext: isSecureContext, onlineAtStart: navigator.onLine,
        profile: "WP03-C2-v1"};
}

function action(label, callback) {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", callback);
    controls.append(button);
    return button;
}

download.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mlpa-wp02-${mode}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
    if (mode === "rx" || mode === "tx") {
        if (!isSecureContext) throw new Error("HTTPSで開いてください。");
        const module = mode === "rx" ? await import("./receive.mjs") : await import("./transmit.mjs");
        await module.mount({action, begin, update, record});
    }
} catch (error) {
    update(`準備失敗 · ${error.message}`);
    record({...begin(), status: "Blocked", error: error.message});
}
