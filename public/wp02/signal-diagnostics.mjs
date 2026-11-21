import {C2} from "../c2-receiver.mjs";
import {BANDPASS} from "./bandpass.mjs";

const WINDOW = 2048;
const FIRST_BIN = Math.ceil(BANDPASS.lowHz * WINDOW / C2.sample_rate);
const LAST_BIN = Math.floor(BANDPASS.highHz * WINDOW / C2.sample_rate);

// Non-overlapping rectangular-window periodogram. Integrated one-sided energy
// at the specified DFT bins, normalized by Parseval. No waveform is returned.
export function summarizeSignal(values, cutoff) {
    let longest = 0;
    let run = 0;
    let squareSum = 0;
    for (const value of values) {
        squareSum += value * value;
        run = Math.abs(value) <= cutoff ? run + 1 : 0;
        longest = Math.max(longest, run);
    }
    const blocks = Math.floor(values.length / WINDOW);
    let analyzedEnergy = 0;
    let bandEnergy = 0;
    for (let block = 0; block < blocks; block++) {
        const offset = block * WINDOW;
        for (let i = 0; i < WINDOW; i++) analyzedEnergy += values[offset + i] ** 2;
        for (let bin = FIRST_BIN; bin <= LAST_BIN; bin++) {
            const coefficient = 2 * Math.cos(2 * Math.PI * bin / WINDOW);
            let previous = 0;
            let beforePrevious = 0;
            for (let i = 0; i < WINDOW; i++) {
                const current = values[offset + i] + coefficient * previous - beforePrevious;
                beforePrevious = previous;
                previous = current;
            }
            bandEnergy += 2 * Math.max(0, previous ** 2 + beforePrevious ** 2
                - coefficient * previous * beforePrevious) / WINDOW;
        }
    }
    return {count: values.length, rms: values.length ? Math.sqrt(squareSum / values.length) : null,
        longestQuietSamples: longest, longestQuietMs: 1000 * longest / C2.sample_rate,
        analyzedSamples: blocks * WINDOW, omittedTailSamples: values.length - blocks * WINDOW,
        bandMeanSquare: blocks ? bandEnergy / (blocks * WINDOW) : null,
        bandFraction: analyzedEnergy > 0 ? bandEnergy / analyzedEnergy : null};
}

export function compareSignals(before, after, origin, opened, lastActive) {
    const stats = values => {
        let peak = 0;
        for (const value of values) peak = Math.max(peak, Math.abs(value));
        const cutoff = peak * C2.detector_thresholds.silence_ratio;
        const leadingEnd = Math.max(0, Math.min(values.length, opened - origin));
        const trailingStart = Math.max(0, Math.min(values.length, lastActive + 480 - origin));
        return {peak, quietCutoff: cutoff,
            all: summarizeSignal(values, cutoff),
            leading: summarizeSignal(values.subarray(0, leadingEnd), cutoff),
            trailing: summarizeSignal(values.subarray(trailingStart), cutoff)};
    };
    return {id: "w11-aligned-energy", origin48k: origin, end48k: origin + before.length,
        filter: BANDPASS, energyDefinition: {window: WINDOW, windowType: "rectangular",
            firstBin: FIRST_BIN, lastBin: LAST_BIN, lowBinHz: FIRST_BIN * C2.sample_rate / WINDOW,
            highBinHz: LAST_BIN * C2.sample_rate / WINDOW, unit: "FS squared"},
        before: stats(before), after: stats(after)};
}
