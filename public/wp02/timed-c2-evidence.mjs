import {C2} from "../c2-receiver.mjs";

const power = (energy, start, end) => (energy[end] - energy[start]) / (end - start);

export function wordEdgeOffset({energy, centers, offset, last}) {
    if (!last) return offset;
    const observations = [];
    for (let i = 0; i < centers.length; i += 3) {
        const center = offset + centers[i];
        const nominal = center - C2.note_samples / 2;
        const body = power(energy, center - 384, center + 384);
        if (body <= 1e-12) continue;
        // Word gaps are much longer than inner gaps. First rising edges after
        // these gaps provide timing without using the damaged inner gaps.
        for (let edge = nominal - 1800; edge <= nominal + 1800; edge += 24) {
            const before = power(energy, edge - 480, edge - 96);
            const crossing = power(energy, edge - 96, edge + 96);
            const after = power(energy, edge + 96, edge + 480);
            if (before < 0.18 * body && crossing >= 0.25 * body && after >= 0.35 * body) {
                observations.push(edge - nominal + offset - C2.ramp_samples / 2);
                break;
            }
        }
    }
    if (observations.length < 8) return offset;
    observations.sort((a, b) => a - b);
    return Math.min(last, Math.max(0, observations[Math.floor(observations.length / 2)]));
}

export function centralGap({energy, center, neighborPower}) {
    const half = 264;
    return power(energy, center - half, center + half) / neighborPower;
}
