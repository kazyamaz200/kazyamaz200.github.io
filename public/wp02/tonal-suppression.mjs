// One stationary component estimated from observed pre-gate history.
// This is an optional experiment, never a reconstruction of vocabulary or rests.
export const TONAL = Object.freeze({id: "w14-stationary-tone", lowHz: 300, highHz: 1150,
    referenceSamples: 9600, validationSamples: 2400, minimumExplained: 0.8});

function fit(values, frequency, start, count) {
    const omega = 2 * Math.PI * frequency / 48000;
    let ss = 0, cc = 0, sc = 0, ys = 0, yc = 0, energy = 0;
    for (let i = start; i < start + count; i++) {
        const sine = Math.sin(omega * i);
        const cosine = Math.cos(omega * i);
        ss += sine * sine;
        cc += cosine * cosine;
        sc += sine * cosine;
        ys += values[i] * sine;
        yc += values[i] * cosine;
        energy += values[i] ** 2;
    }
    const determinant = ss * cc - sc * sc;
    const a = (ys * cc - yc * sc) / determinant;
    const b = (yc * ss - ys * sc) / determinant;
    return {frequency, a, b, energy, projected: Math.max(0, a * ys + b * yc)};
}

export function suppressStationaryTone(input, availableReference) {
    const {referenceSamples: count, validationSamples: validation} = TONAL;
    const metadata = {id: TONAL.id, applied: false, reason: "INSUFFICIENT_REFERENCE"};
    if (availableReference < count + validation || input.length < count + validation) {
        return {values: input, metadata};
    }
    let best = null;
    for (let frequency = TONAL.lowHz; frequency <= TONAL.highHz; frequency += 2) {
        const trial = fit(input, frequency, 0, count);
        if (!best || trial.projected > best.projected) best = trial;
    }
    let left = Math.max(TONAL.lowHz, best.frequency - 2);
    let right = Math.min(TONAL.highHz, best.frequency + 2);
    for (let i = 0; i < 36; i++) {
        const f1 = left + (right - left) / 3;
        const f2 = right - (right - left) / 3;
        if (fit(input, f1, 0, count).projected > fit(input, f2, 0, count).projected) right = f2;
        else left = f1;
    }
    best = fit(input, (left + right) / 2, 0, count);
    const omega = 2 * Math.PI * best.frequency / 48000;
    let error = 0;
    let energy = 0;
    for (let i = count; i < count + validation; i++) {
        const predicted = best.a * Math.sin(omega * i) + best.b * Math.cos(omega * i);
        error += (input[i] - predicted) ** 2;
        energy += input[i] ** 2;
    }
    const referenceExplained = best.energy > 0 ? best.projected / best.energy : 0;
    const validationExplained = energy > 0 ? 1 - error / energy : 0;
    Object.assign(metadata, {frequencyHz: best.frequency, referenceExplained, validationExplained,
        componentAmplitude: Math.hypot(best.a, best.b), referenceSamples: count, validationSamples: validation});
    if (best.energy / count < 1e-16 || referenceExplained < TONAL.minimumExplained
        || validationExplained < TONAL.minimumExplained) {
        metadata.reason = "NO_STABLE_TONE";
        return {values: input, metadata};
    }
    const output = Float64Array.from(input, (value, i) =>
        value - best.a * Math.sin(omega * i) - best.b * Math.cos(omega * i));
    metadata.applied = true;
    metadata.reason = null;
    return {values: output, metadata};
}
