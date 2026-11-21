import {C2} from "../c2-receiver.mjs";
import {CaptureError, MAX_PCM, Resample48k} from "./capture-adapter.mjs";
import {decodeTimedC2} from "./timed-c2-receiver.mjs";
import {centralGap, wordEdgeOffset} from "./timed-c2-evidence.mjs";

const WARMUP = C2.sample_rate;
const ENDPOINTS = Object.freeze({receiver: "B", peer: "A"});

export class TimedCapture {
    constructor(rate) {
        this.rate = rate;
        this.resampler = new Resample48k(rate);
        this.buffer = new Float64Array(MAX_PCM);
        this.used = 0;
        this.stats = {firstFrame: null, nextFrame: null, inputSamples: 0, outputSamples: 0,
            warmupSamples: WARMUP, targetSamples: MAX_PCM, candidate: null,
            blocks: 0, missing: 0, overlap: 0, clip: 0, peak: 0};
    }

    push({start, samples, clip = 0, peak = 0}) {
        const stats = this.stats;
        if (stats.candidate) throw new CaptureError("CAPTURE_STOPPED");
        if (!(samples instanceof Float32Array) || !samples.length || samples.length > this.rate
            || !Number.isSafeInteger(start) || start < 0) {
            throw new CaptureError("INVALID_CAPTURE_BLOCK");
        }
        const delta = start - (stats.nextFrame ?? start);
        if (delta !== 0) {
            stats.missing += Math.max(delta, 0);
            stats.overlap += Math.max(-delta, 0);
            throw new CaptureError(delta > 0 ? "CAPTURE_GAP" : "CAPTURE_OVERLAP");
        }
        if (samples.some(sample => !Number.isFinite(sample) || Math.abs(sample) > 1)) {
            throw new CaptureError("INVALID_CAPTURE_SAMPLE");
        }
        stats.firstFrame ??= start;
        stats.nextFrame = start + samples.length;
        stats.inputSamples += samples.length;
        stats.blocks++;
        const output = this.resampler.push(samples);
        const skip = Math.max(0, WARMUP - stats.outputSamples);
        stats.outputSamples += output.length;
        if (skip >= output.length) return null;
        stats.clip += clip;
        stats.peak = Math.max(stats.peak, peak);
        if (stats.clip > 0) throw new CaptureError("CAPTURE_CLIPPED");
        const copy = output.subarray(skip, skip + MAX_PCM - this.used);
        this.buffer.set(copy, this.used);
        this.used += copy.length;
        if (this.used < MAX_PCM) return null;
        stats.candidate = {start48k: WARMUP, end48k: WARMUP + MAX_PCM, samples: MAX_PCM, peak: stats.peak};
        stats.codecDiagnostic = {};
        return decodeTimedC2(this.buffer, C2.sample_rate, ENDPOINTS,
            {selectOffset: wordEdgeOffset, checkInnerGap: centralGap, diagnostic: stats.codecDiagnostic});
    }

    get ready() {
        return this.stats.outputSamples >= WARMUP;
    }

    timeoutCode() {
        return this.stats.inputSamples === 0 ? "CAPTURE_INTERRUPTED" : "AUDIO_TRUNCATED";
    }
}
