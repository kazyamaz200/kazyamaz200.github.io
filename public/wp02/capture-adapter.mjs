import {C2, decodeC2} from "../c2-receiver.mjs";

export const RECEIVE_MS = 20000;
export const MAX_PCM = 10 * C2.sample_rate;
const GATE_BLOCK = 480;
const PREROLL = 12000;
const QUIET_BLOCKS = 24;
const GATE_RMS = 0.003;
const HALF_FILTER = 32;

export class CaptureError extends Error {
    constructor(code, detail = "") {
        super(detail || code);
        this.code = code;
    }
}

export class Resample48k {
    constructor(rate) {
        if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) {
            throw new CaptureError("UNSUPPORTED_SAMPLE_RATE");
        }
        this.rate = rate;
        this.step = rate / C2.sample_rate;
        this.cutoff = 0.44 * Math.min(1, C2.sample_rate / rate);
        this.input = new Float64Array(0);
        this.origin = 0;
        // Start only where the convolution has real input on both sides.
        this.outputIndex = Math.ceil(HALF_FILTER / this.step);
    }

    push(samples) {
        if (this.rate === C2.sample_rate) return samples;
        const joined = new Float64Array(this.input.length + samples.length);
        joined.set(this.input);
        joined.set(samples, this.input.length);
        const out = [];
        const end = this.origin + joined.length;
        let position = this.outputIndex * this.step;
        while (Math.floor(position) + HALF_FILTER < end) {
            const center = Math.floor(position);
            let sum = 0;
            let weightSum = 0;
            for (let i = center - HALF_FILTER + 1; i <= center + HALF_FILTER; i++) {
                const distance = i - position;
                const phase = 2 * Math.PI * this.cutoff * distance;
                const sinc = phase === 0 ? 1 : Math.sin(phase) / phase;
                const window = 0.5 + 0.5 * Math.cos(Math.PI * distance / HALF_FILTER);
                const weight = sinc * window;
                sum += joined[i - this.origin] * weight;
                weightSum += weight;
            }
            out.push(sum / weightSum);
            position = ++this.outputIndex * this.step;
        }
        const discard = Math.max(0, Math.floor(position) - HALF_FILTER + 1 - this.origin);
        this.input = joined.slice(discard);
        this.origin += discard;
        return Float64Array.from(out);
    }
}

export class C2Capture {
    constructor(rate) {
        this.rate = rate;
        this.resampler = new Resample48k(rate);
        this.history = new Float64Array(PREROLL);
        this.pending = new Float64Array(GATE_BLOCK);
        this.signal = new Float64Array(MAX_PCM);
        this.stats = {firstFrame: null, nextFrame: null, inputSamples: 0, outputSamples: 0,
            missing: 0, overlap: 0, clip: 0, peak: 0, blocks: 0, candidate: null};
        this.historySize = 0;
        this.historyIndex = 0;
        this.signalSize = 0;
        this.pendingSize = 0;
        this.consumed = 0;
        this.quiet = 0;
        this.finished = false;
    }

    push({start, samples, clip = 0, peak = 0}) {
        if (this.finished) throw new CaptureError("CAPTURE_STOPPED");
        if (!(samples instanceof Float32Array) || !samples.length || samples.length > this.rate
            || !Number.isSafeInteger(start) || start < 0) {
            throw new CaptureError("INVALID_CAPTURE_BLOCK");
        }
        const stats = this.stats;
        stats.firstFrame ??= start;
        const delta = start - (stats.nextFrame ?? start);
        if (delta !== 0) {
            stats.missing += Math.max(delta, 0);
            stats.overlap += Math.max(-delta, 0);
            throw new CaptureError(delta > 0 ? "CAPTURE_GAP" : "CAPTURE_OVERLAP");
        }
        for (const sample of samples) {
            if (!Number.isFinite(sample) || Math.abs(sample) > 1) {
                throw new CaptureError("INVALID_CAPTURE_SAMPLE");
            }
        }
        stats.nextFrame = start + samples.length;
        stats.inputSamples += samples.length;
        stats.clip += clip;
        stats.peak = Math.max(stats.peak, peak);
        stats.blocks++;
        const resampled = this.resampler.push(samples);
        stats.outputSamples += resampled.length;
        for (const sample of resampled) {
            this.pending[this.pendingSize++] = sample;
            if (this.pendingSize === GATE_BLOCK) {
                this.pendingSize = 0;
                const result = this.consumeBlock();
                if (result) return result;
            }
        }
        return null;
    }

    consumeBlock() {
        const blockStart = this.consumed;
        this.consumed += GATE_BLOCK;
        let power = 0;
        for (const sample of this.pending) power += sample * sample;
        const active = power >= GATE_BLOCK * GATE_RMS ** 2;
        if (this.signalSize === 0 && !active) {
            for (const sample of this.pending) {
                this.history[this.historyIndex] = sample;
                this.historyIndex = (this.historyIndex + 1) % PREROLL;
            }
            this.historySize = Math.min(PREROLL, this.historySize + GATE_BLOCK);
            return null;
        }
        if (this.signalSize === 0) {
            this.signalOrigin = blockStart - this.historySize;
            const start = (this.historyIndex - this.historySize + PREROLL) % PREROLL;
            for (let i = 0; i < this.historySize; i++) {
                this.signal[i] = this.history[(start + i) % PREROLL];
            }
            this.signalSize = this.historySize;
        }
        if (this.signalSize + GATE_BLOCK > MAX_PCM) throw new CaptureError("CANDIDATE_LIMIT");
        this.signal.set(this.pending, this.signalSize);
        this.signalSize += GATE_BLOCK;
        this.quiet = active ? 0 : this.quiet + 1;
        if (this.quiet < QUIET_BLOCKS) return null;
        return this.finishCandidate();
    }

    finishCandidate() {
        const observed = this.signal.subarray(0, this.signalSize);
        let peak = 0;
        for (const sample of observed) peak = Math.max(peak, Math.abs(sample));
        const cutoff = peak * C2.detector_thresholds.silence_ratio;
        let first = 0;
        let last = observed.length - 1;
        while (first < observed.length && Math.abs(observed[first]) <= cutoff) first++;
        while (last >= 0 && Math.abs(observed[last]) <= cutoff) last--;
        const start = first - C2.frame_gap_samples;
        const end = last + 1 + C2.frame_gap_samples;
        if (first > last || start < 0 || end > observed.length) {
            throw new CaptureError("AUDIO_TRUNCATED", "Actual leading or trailing quiet samples are missing.");
        }
        const samples = observed.slice(start, end);
        this.stats.candidate = {start48k: this.signalOrigin + start, end48k: this.signalOrigin + end,
            samples: samples.length, peak};
        this.finished = true;
        // The same M01 envelope has logical speaker A and receiver B in either
        // physical phone direction. Only endpoint configuration enters the decoder.
        return decodeC2(samples, C2.sample_rate, {receiver: "B", peer: "A"});
    }

    timeoutCode() {
        if (this.stats.inputSamples === 0) return "CAPTURE_INTERRUPTED";
        return this.signalSize ? "AUDIO_TRUNCATED" : "NO_SIGNAL";
    }
}

export function stopCapture({stream, source, worklet, context}) {
    // The microphone is released even when initialization stopped partway through.
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (worklet) {
        worklet.port.onmessage = null;
        worklet.port.close();
        worklet.disconnect();
    }
    source?.disconnect();
    if (context && context.state !== "closed") return context.close();
    return Promise.resolve();
}
