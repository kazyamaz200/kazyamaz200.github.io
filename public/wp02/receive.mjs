import {C2Capture, CaptureError, RECEIVE_MS, stopCapture} from "./capture-adapter.mjs";

const audio = Object.freeze({echoCancellation: false, autoGainControl: false,
    noiseSuppression: false, channelCount: {ideal: 1}});
const settingKeys = ["echoCancellation", "autoGainControl", "noiseSuppression", "channelCount", "sampleRate", "sampleSize", "latency"];

export async function mount({action, begin, update, record}) {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioWorkletNode || !globalThis.AudioContext) {
        throw new Error("MIC_OR_AUDIOWORKLET_UNAVAILABLE");
    }
    const asset = await fetch(new URL("./mic-worklet.js", import.meta.url));
    if (!asset.ok) throw new Error("WORKLET_ASSET_UNAVAILABLE");
    const workletURL = URL.createObjectURL(new Blob([await asset.text()], {type: "text/javascript"}));
    let active = null;
    const arm = action("受信開始", armReceiver);
    const cancel = action("収録停止", () => active?.finish("Failed", "CANCELLED"));
    cancel.disabled = true;
    update("準備済み。必要ならネットワークを切り、受信を開始してください。");

    async function armReceiver() {
        if (active) return;
        const started = performance.now();
        const report = {...begin(), requestedAudio: audio, processorSettings: null, status: "Arming"};
        const session = {report, started, adapter: null, initialized: false, ready: false,
            cpuMs: 0, maxBlockMs: 0, maxClip: 0, maxPeak: 0};
        let timer;
        let ended;
        let interrupted;
        let visibility;
        let finishing = false;
        session.finish = (status, error, decoded) => {
            if (finishing) return;
            finishing = true;
            clearTimeout(timer);
            window.removeEventListener("pagehide", interrupted);
            document.removeEventListener("visibilitychange", visibility);
            if (session.context) session.context.onstatechange = null;
            if (session.worklet) session.worklet.onprocessorerror = null;
            session.stream?.getAudioTracks().forEach(track => {
                track.removeEventListener("ended", ended);
                track.removeEventListener("mute", ended);
            });
            Object.assign(report, {status, error, decoded, endedUtc: new Date().toISOString(),
                elapsedMs: Math.round(performance.now() - started),
                processingMs: Number(session.cpuMs.toFixed(2)), maxBlockProcessingMs: Number(session.maxBlockMs.toFixed(2)),
                capture: session.adapter?.stats ?? null});
            const closing = stopCapture(session);
            update(status === "Displayed" ? "復元成功" : `受信終了 · ${error}`);
            cancel.disabled = true;
            record(report);
            closing.catch(() => {}).finally(() => {
                active = null;
                arm.disabled = false;
            });
        };
        active = session;
        arm.disabled = true;
        cancel.disabled = false;
        update("マイク権限・収録を準備中");
        ended = () => session.finish("Failed", "CAPTURE_INTERRUPTED");
        interrupted = ended;
        visibility = () => { if (document.hidden) interrupted(); };
        const timedOut = () => session.finish(session.initialized ? "Failed" : "Blocked",
            session.initialized ? session.adapter.timeoutCode() : "CAPTURE_SETUP_TIMEOUT");
        window.addEventListener("pagehide", interrupted, {once: true});
        document.addEventListener("visibilitychange", visibility);
        timer = setTimeout(timedOut, RECEIVE_MS);

        try {
            session.context = new AudioContext();
            await session.context.resume();
            if (finishing) return;
            const stream = await navigator.mediaDevices.getUserMedia({audio, video: false});
            if (finishing) {
                await stopCapture({stream});
                return;
            }
            session.stream = stream;
            const [track] = stream.getAudioTracks();
            if (!track) throw new CaptureError("MIC_UNAVAILABLE");
            const settings = track.getSettings();
            report.processorSettings = Object.fromEntries(settingKeys.map(key => [key, settings[key] ?? null]));
            report.contextSampleRate = session.context.sampleRate;
            report.resampleTarget = 48000;
            report.resampleRatio = 48000 / session.context.sampleRate;
            track.addEventListener("ended", ended, {once: true});
            track.addEventListener("mute", ended, {once: true});
            session.adapter = new C2Capture(session.context.sampleRate);
            await session.context.audioWorklet.addModule(workletURL);
            if (finishing) return;
            session.source = session.context.createMediaStreamSource(stream);
            session.worklet = new AudioWorkletNode(session.context, "capture-pcm", {outputChannelCount: [1]});
            session.worklet.onprocessorerror = ended;
            session.worklet.port.onmessage = ({data}) => {
                if (finishing) return;
                if (performance.now() - started >= RECEIVE_MS) return timedOut();
                if (data.error) {
                    report.workletError = {code: data.error, delta: data.delta ?? null};
                    return session.finish("Failed", data.error);
                }
                const workStart = performance.now();
                let result;
                try {
                    result = session.adapter.push(data);
                    session.worklet.port.postMessage({ack: data.start});
                    report.observedChannels = data.channels;
                } catch (error) {
                    return session.finish("Failed", error.code ?? "CAPTURE_PROCESSING_ERROR");
                } finally {
                    const elapsed = performance.now() - workStart;
                    session.cpuMs += elapsed;
                    session.maxBlockMs = Math.max(session.maxBlockMs, elapsed);
                }
                if (performance.now() - started >= RECEIVE_MS) return timedOut();
                if (result) {
                    return session.finish(result.ok ? "Displayed" : "Failed", result.code, result);
                }
                if (!session.ready && session.adapter.stats.outputSamples >= 12000) {
                    session.ready = true;
                    report.readyUtc = new Date().toISOString();
                    update("収録中 · 送信できます");
                }
            };
            session.context.onstatechange = () => {
                if (session.context.state !== "running") ended();
            };
            session.source.connect(session.worklet).connect(session.context.destination);
            session.initialized = true;
        } catch (error) {
            session.finish("Blocked", error.code ?? (error.name === "NotAllowedError" ? "MIC_PERMISSION_DENIED" : error.name));
        }
    }
}
