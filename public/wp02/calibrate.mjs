import {Resample48k, stopCapture} from "./capture-adapter.mjs";
import {calibrationProbe, combineEchoMeasurements, estimateEcho} from "./echo-calibration.mjs";

const RATE = 48000;
const CAPTURE_SECONDS = 5;

export async function mount({action, begin, record, update}, mode) {
    if (mode === "cal-tx") {
        const play = action("測定音を再生", async () => {
            play.disabled = true;
            let context;
            try {
                context = new AudioContext();
                await context.resume();
                const probe = calibrationProbe();
                const buffer = context.createBuffer(1, probe.length, RATE);
                buffer.copyToChannel(probe, 0);
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                await new Promise(resolve => {
                    source.onended = resolve;
                    source.start();
                });
                update("再生完了。iPhoneの測定結果を確認してください。");
            } catch (error) {
                update(`再生失敗 · ${error.message}`);
            } finally {
                if (context) await stopCapture({context}).catch(() => {});
                play.disabled = false;
            }
        });
        update("iPhoneに「測定音を再生してください」と表示されたら、測定音を1回再生します。");
        return;
    }

    const response = await fetch(new URL("./mic-worklet.js", import.meta.url));
    if (!response.ok) throw new Error("WORKLET_ASSET_UNAVAILABLE");
    const url = URL.createObjectURL(new Blob([await response.text()], {type: "text/javascript"}));
    const attempts = [];
    const measure = action("測定開始", async () => {
        measure.disabled = true;
        reset.disabled = true;
        const started = begin();
        let report;
        try {
            report = await captureProbe(url, update);
        } catch (error) {
            report = {ok: false, reason: error.message};
        }
        attempts.push(report);
        const settings = combineEchoMeasurements(attempts);
        const completed = attempts.length === 3;
        record({...started, type: "w17-echo-calibration", attempts: [...attempts], settings,
            w16Query: settings ? `?mode=rx&preprocess=echo&delaySamples=${settings.delaySamples}&gain=${settings.gain}` : null});
        update(settings ? "3回の結果が一致しました。JSONを保存してください。"
            : completed ? "3回の結果から補正値を確定できませんでした。JSONを保存できます。"
            : `測定 ${attempts.length}/3。次の測定を開始できます。`);
        measure.disabled = completed;
        reset.disabled = false;
    });
    const reset = action("新しい3回の測定", () => {
        attempts.length = 0;
        measure.disabled = false;
        reset.disabled = true;
        update("測定開始を押してください。");
    });
    reset.disabled = true;
    update("配置と音量を固定し、各回の準備表示後にMacで測定音を1回再生してください。");
}

async function captureProbe(url, update) {
    const context = new AudioContext();
    let stream;
    let source;
    let worklet;
    let timeout;
    let pageHidden;
    try {
        await context.resume();
        stream = await navigator.mediaDevices.getUserMedia({audio: {
            echoCancellation: false, autoGainControl: false, noiseSuppression: false,
            channelCount: {ideal: 1},
        }, video: false});
        await context.audioWorklet.addModule(url);
        source = context.createMediaStreamSource(stream);
        worklet = new AudioWorkletNode(context, "capture-pcm", {outputChannelCount: [1]});
        const resampler = new Resample48k(context.sampleRate);
        const input = new Float64Array(RATE * CAPTURE_SECONDS);
        let used = 0;
        let ready = false;
        let expectedFrame = null;
        let observedChannels = null;
        const track = stream.getAudioTracks()[0];
        const settings = track.getSettings();
        await new Promise((resolve, reject) => {
            const fail = code => reject(new Error(code));
            timeout = setTimeout(() => fail("CAPTURE_TIMEOUT"), 7500);
            pageHidden = () => fail("CAPTURE_INTERRUPTED");
            window.addEventListener("pagehide", pageHidden, {once: true});
            worklet.onprocessorerror = pageHidden;
            track.addEventListener("ended", pageHidden, {once: true});
            worklet.port.onmessage = ({data}) => {
                if (data.error) return fail(data.error);
                if (expectedFrame !== null && data.start !== expectedFrame) return fail("CAPTURE_GAP");
                if (data.clip > 0) return fail("CAPTURE_CLIPPED");
                if (observedChannels !== null && data.channels !== observedChannels) return fail("CAPTURE_CHANNEL_CHANGE");
                observedChannels = data.channels;
                expectedFrame = data.start + data.samples.length;
                worklet.port.postMessage({ack: data.start});
                const output = resampler.push(data.samples);
                input.set(output.subarray(0, input.length - used), used);
                used = Math.min(input.length, used + output.length);
                if (!ready && used >= RATE / 4) {
                    ready = true;
                    update("測定音を再生してください（1回）。");
                }
                if (used === input.length) resolve();
            };
            source.connect(worklet).connect(context.destination);
        });
        return {...estimateEcho(input), contextSampleRate: context.sampleRate, observedChannels,
            captureSampleRate: RATE, echoCancellation: settings.echoCancellation ?? null,
            autoGainControl: settings.autoGainControl ?? null, noiseSuppression: settings.noiseSuppression ?? null};
    } finally {
        clearTimeout(timeout);
        if (pageHidden) window.removeEventListener("pagehide", pageHidden);
        await stopCapture({context, stream, source, worklet}).catch(() => {});
    }
}
