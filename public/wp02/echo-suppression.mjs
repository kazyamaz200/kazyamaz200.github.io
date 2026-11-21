// Finite inverse of a single delayed copy. Emit only positions for which
// every term uses captured input.
export function suppressEcho(input, delaySamples, gain) {
    const order = 5;
    const discardedSamples = order * delaySamples;
    const weights = Array.from({length: order + 1}, (_, i) => (-gain) ** i);
    const values = new Float64Array(Math.max(0, input.length - discardedSamples));
    for (let i = 0; i < values.length; i++) {
        const position = i + discardedSamples;
        let value = 0;
        for (let j = 0; j < weights.length; j++) {
            value += weights[j] * input[position - j * delaySamples];
        }
        values[i] = value;
    }
    return {values, discardedSamples};
}
