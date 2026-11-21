import {C2} from "../c2-receiver.mjs";

const RATE = C2.sample_rate;
const PROBE_LENGTH = 4096;
const MAX_DELAY = 2400;
const DIRECT_WINDOW = 144;

// Deterministic broadband probe shared by both pages, with gentle endpoints.
export function calibrationProbe() {
    let state = 0x1a2b3c4d;
    return Float32Array.from({length: PROBE_LENGTH}, (_, i) => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return 0.18 * (state / 2147483648) * Math.min(1, i / 96, (PROBE_LENGTH - 1 - i) / 96);
    });
}

function fft(real, imag, inverse = false) {
    const size = real.length;
    for (let i = 1, j = 0; i < size; i++) {
        let bit = size >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
    }
    for (let width = 2; width <= size; width *= 2) {
        const half = width / 2;
        for (let j = 0; j < half; j++) {
            const angle = (inverse ? 2 : -2) * Math.PI * j / width;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            for (let i = j; i < size; i += width) {
                const k = i + half;
                const r = real[k] * cos - imag[k] * sin;
                const q = real[k] * sin + imag[k] * cos;
                real[k] = real[i] - r;
                imag[k] = imag[i] - q;
                real[i] += r;
                imag[i] += q;
            }
        }
    }
}

function impulseResponse(input, probe) {
    const size = 2 ** Math.ceil(Math.log2(input.length + probe.length));
    const real = new Float64Array(size);
    const imag = new Float64Array(size);
    const pr = new Float64Array(size);
    const pi = new Float64Array(size);
    real.set(input);
    pr.set(probe);
    fft(real, imag);
    fft(pr, pi);
    const regularization = 0.001 * probe.reduce((sum, x) => sum + x * x, 0);
    for (let i = 0; i < size; i++) {
        // Regularized inverse of the probe. Weak spectral bins cannot
        // amplify the microphone noise without bound.
        const power = pr[i] * pr[i] + pi[i] * pi[i] + regularization;
        const r = real[i] * pr[i] + imag[i] * pi[i];
        imag[i] = (imag[i] * pr[i] - real[i] * pi[i]) / power;
        real[i] = r / power;
    }
    fft(real, imag, true);
    return real.subarray(0, input.length - probe.length + 1);
}

export function estimateEcho(input) {
    const fail = (reason, detail = {}) => ({ok: false, reason, ...detail});
    const probe = calibrationProbe();
    if (input.length < RATE / 2 || input.length > RATE * 5) return fail("CAPTURE_LENGTH");
    const response = impulseResponse(input, probe);
    let peak = 0;
    let peakIndex = 0;
    for (let i = 0; i < response.length; i++) {
        if (Math.abs(response[i]) > peak) {
            peak = Math.abs(response[i]);
            peakIndex = i;
        }
    }
    // Fit a delayed copy of the locally observed direct response, including
    // the speaker and microphone response, then check the residual.
    if (peak === 0 || peakIndex < DIRECT_WINDOW || peakIndex + MAX_DELAY + DIRECT_WINDOW >= response.length) {
        return fail("NO_COMPLETE_DIRECT_RESPONSE");
    }
    const block = response.subarray(peakIndex - 16, peakIndex + DIRECT_WINDOW - 16);
    const energy = block.reduce((sum, x) => sum + x * x, 0);
    const candidates = [];
    for (let delay = DIRECT_WINDOW; delay <= MAX_DELAY; delay++) {
        let cross = 0;
        let targetEnergy = 0;
        for (let j = 0; j < block.length; j++) {
            const y = response[peakIndex - 16 + delay + j];
            cross += block[j] * y;
            targetEnergy += y * y;
        }
        const gain = cross / energy;
        const fit = targetEnergy ? cross * cross / (energy * targetEnergy) : 0;
        candidates.push({delaySamples: delay, gain, fit});
    }
    const best = candidates.reduce((a, b) => Math.abs(a.gain) >= Math.abs(b.gain) ? a : b);
    const competitor = candidates.reduce((maximum, x) =>
        Math.abs(x.delaySamples - best.delaySamples) >= DIRECT_WINDOW
            ? Math.max(maximum, Math.abs(x.gain)) : maximum, 0);
    const detail = {fit: best.fit, candidateDelaySamples: best.delaySamples, candidateGain: best.gain};
    if (Math.abs(best.gain) < 0.06 || best.fit < 0.65) return fail("NO_CLEAR_REFLECTION", detail);
    if (Math.abs(best.gain) > 0.3) return fail("GAIN_OUTSIDE_W16", detail);
    if (competitor > Math.abs(best.gain) * 0.65) return fail("MULTIPLE_REFLECTIONS", detail);
    // The strongest matched arrival must stand clear of the background.
    let background = 0;
    for (let i = 0; i < peakIndex - DIRECT_WINDOW; i++) background = Math.max(background, Math.abs(response[i]));
    if (background > peak * 0.45) return fail("DIRECT_ARRIVAL_AMBIGUOUS", detail);
    return {ok: true, delaySamples: best.delaySamples, gain: best.gain, fit: best.fit};
}

export function combineEchoMeasurements(attempts) {
    if (attempts.length !== 3 || attempts.some(attempt => !attempt.ok)) return null;
    const delays = attempts.map(attempt => attempt.delaySamples).sort((a, b) => a - b);
    const gains = attempts.map(attempt => attempt.gain).sort((a, b) => a - b);
    if (delays[2] - delays[0] > 4 || gains[2] - gains[0] > 0.05 || gains[0] * gains[2] <= 0) return null;
    return {delaySamples: delays[1], gain: Number(gains[1].toFixed(4))};
}
