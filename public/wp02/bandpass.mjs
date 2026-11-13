// Symmetric FIR on a completed 48 kHz candidate. Only fully supported output
// samples are emitted, preserving their positions relative to the input.
export const BANDPASS = Object.freeze({id: "w10-fir-300-1150", lowHz: 300,
    highHz: 1150, taps: 481, edgeSamples: 240});
const half = BANDPASS.edgeSamples;
const kernel = Float64Array.from({length: BANDPASS.taps}, (_, i) => {
    const n = i - half;
    const low = BANDPASS.lowHz / 48000;
    const high = BANDPASS.highHz / 48000;
    const ideal = n === 0 ? 2 * (high - low)
        : (Math.sin(2 * Math.PI * high * n) - Math.sin(2 * Math.PI * low * n)) / (Math.PI * n);
    const phase = 2 * Math.PI * i / (BANDPASS.taps - 1);
    return ideal * (0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase));
});

export function bandpassCandidate(input) {
    const output = new Float64Array(Math.max(0, input.length - 2 * half));
    for (let i = 0; i < output.length; i++) {
        let sum = kernel[half] * input[i + half];
        for (let j = 0; j < half; j++) {
            sum += kernel[j] * (input[i + j] + input[i + 2 * half - j]);
        }
        output[i] = sum;
    }
    return output;
}
