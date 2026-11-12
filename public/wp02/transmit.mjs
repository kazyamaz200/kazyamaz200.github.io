import {C2, encodeC2} from "../c2-receiver.mjs";

// This source is loaded only by the transmitting page.
const meaning = {act: "REQ", speaker: "A", addressee: "B", polarity: "POS",
    predicate: "PASS", actor: "A", reference: "B", side: "RIGHT"};
const header = {version: 1, session: 7, seq: 0, reply: null};

export function mount({action, begin, update, record}) {
    const play = action("M01を再生", () => transmit(true));
    const control = action("スピーカー停止対照", () => transmit(false));
    let active = null;
    update("送信待機。受信側の準備を確認してから操作してください。");

    async function transmit(outputEnabled) {
        if (active) return;
        const report = {...begin(), outputEnabled};
        const started = performance.now();
        play.disabled = control.disabled = true;
        let context;
        let source;
        let gain;
        let timer;
        let interrupt;
        let visibility;
        active = report;
        try {
            context = new AudioContext();
            await context.resume();
            const encoded = encodeC2(meaning, header);
            if (!encoded.ok) throw new Error(encoded.code);
            const buffer = context.createBuffer(1, encoded.samples.length, C2.sample_rate);
            buffer.copyToChannel(Float32Array.from(encoded.samples), 0);
            source = context.createBufferSource();
            source.buffer = buffer;
            gain = context.createGain();
            gain.gain.value = outputEnabled ? 1 : 0;
            source.connect(gain).connect(context.destination);
            Object.assign(report, {samples: buffer.length, pcmSampleRate: buffer.sampleRate,
                contextSampleRate: context.sampleRate, outputLatency: context.outputLatency ?? null,
                baseLatency: context.baseLatency ?? null});
            update(outputEnabled ? "再生中" : "出力停止対照を実施中");
            await new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error("PLAYBACK_TIMEOUT")), 10000);
                interrupt = () => reject(new Error("PLAYBACK_INTERRUPTED"));
                visibility = () => { if (document.hidden) interrupt(); };
                window.addEventListener("pagehide", interrupt, {once: true});
                document.addEventListener("visibilitychange", visibility);
                source.onended = resolve;
                report.playStartUtc = new Date().toISOString();
                report.contextPlayStart = context.currentTime;
                source.start();
            });
            report.status = "Sent";
            report.playEndUtc = new Date().toISOString();
            report.contextPlayEnd = context.currentTime;
        } catch (error) {
            report.status = "Failed";
            report.error = error.name === "Error" ? error.message : error.name;
        } finally {
            clearTimeout(timer);
            if (interrupt) window.removeEventListener("pagehide", interrupt);
            if (visibility) document.removeEventListener("visibilitychange", visibility);
            if (source) {
                source.onended = null;
                try { source.stop(); } catch {}
                source.disconnect();
            }
            gain?.disconnect();
            if (context && context.state !== "closed") await context.close().catch(() => {});
            report.elapsedMs = Math.round(performance.now() - started);
            record(report);
            update(report.status === "Sent" ? "送信操作完了" : `送信失敗 · ${report.error}`);
            active = null;
            play.disabled = control.disabled = false;
        }
    }
}
