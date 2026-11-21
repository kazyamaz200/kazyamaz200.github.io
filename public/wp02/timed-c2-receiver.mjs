import {C2, decodeC2EventFrame} from "../c2-receiver.mjs";

const HOP = 480;
const WINDOW = 1920;
const INNER_HALF_WINDOW = 144;
const centers = [];
const wordGaps = [];
let length = C2.frame_gap_samples;
for (let word = 0; word < 14; word++) {
    if (word) {
        wordGaps.push(length + C2.word_gap_samples / 2);
        length += C2.word_gap_samples;
    }
    for (let note = 0; note < 3; note++) {
        if (note) length += C2.inner_gap_samples;
        centers.push(length + C2.note_samples / 2);
        length += C2.note_samples;
    }
}
length += C2.frame_gap_samples;
const guards = [C2.frame_gap_samples / 2, ...wordGaps, length - C2.frame_gap_samples / 2];

function prefix(samples) {
    const sum = new Float64Array(samples.length + 1);
    for (let i = 0; i < samples.length; i++) sum[i + 1] = sum[i] + samples[i] ** 2;
    return sum;
}

function tone(samples, center, energy) {
    const start = center - WINDOW / 2;
    const stop = start + WINDOW;
    let best = 0;
    let second = 0;
    let pitch = -1;
    for (const [index, frequency] of C2.frequencies.entries()) {
        const omega = 2 * Math.PI * frequency / C2.sample_rate;
        let sine = 0, cosine = 0;
        for (let i = start; i < stop; i++) {
            sine += samples[i] * Math.sin(omega * (i - start));
            cosine += samples[i] * Math.cos(omega * (i - start));
        }
        const score = 2 * (sine ** 2 + cosine ** 2) / WINDOW;
        if (score > best) {
            second = best;
            best = score;
            pitch = index;
        } else second = Math.max(second, score);
    }
    return {pitch, power: best / WINDOW, fraction: best / energy, ratio: best / second};
}

function eventsFromPitches(pitches) {
    const events = [{rest: 8}];
    for (const [index, pitch] of pitches.entries()) {
        if (index) events.push({rest: index % 3 === 0 ? 4 : 1});
        events.push({pitch});
    }
    events.push({rest: 8});
    return events;
}

export function decodeTimedC2(samples, sampleRate, endpoints, {selectOffset, checkInnerGap, diagnostic} = {}) {
    const fail = (code, detail = {}) => ({ok: false, stage: "TimedSound.detect", code, ...detail});
    if (!(samples instanceof Float64Array) || sampleRate !== C2.sample_rate) return fail("INVALID_PCM");
    if (samples.length < length) return fail("AUDIO_TRUNCATED");
    if (samples.length > sampleRate * 10 || samples.some(x => !Number.isFinite(x) || Math.abs(x) > 1)) {
        return fail("RESOURCE_LIMIT");
    }
    const energy = prefix(samples);
    const windowEnergy = center => energy[center + WINDOW / 2] - energy[center - WINDOW / 2];
    const average = (points, offset) => points.reduce((sum, center) =>
        sum + windowEnergy(center + offset), 0) / points.length;
    const alignment = offset => average(centers, offset) - average(guards, offset);
    const last = samples.length - length;
    let offset = last;
    let strength = alignment(last);
    for (let i = 0; i < last; i += HOP) {
        const score = alignment(i);
        if (score > strength) [offset, strength] = [i, score];
    }
    const coarse = offset;
    for (let i = Math.max(0, coarse - HOP); i <= Math.min(last, coarse + HOP); i += 48) {
        const score = alignment(i);
        if (score > strength) [offset, strength] = [i, score];
    }
    if (strength <= 0) return fail("NO_TIMING_CONTRAST");
    const originalOffset = offset;
    if (selectOffset) offset = selectOffset({energy, centers, offset, last});
    if (diagnostic) Object.assign(diagnostic, {originalOffset, offset, innerGaps: []});
    const guardPowers = guards.map(center => windowEnergy(center + offset) / WINDOW);
    const noise = guardPowers.slice().sort((a, b) => a - b)[Math.floor(guards.length / 2)];
    const tones = [];
    for (const [index, center] of centers.entries()) {
        // The two overlapping windows must independently support the same note.
        const early = center + offset - 480;
        const late = center + offset + 480;
        const a = tone(samples, early, windowEnergy(early));
        const b = tone(samples, late, windowEnergy(late));
        if (a.pitch !== b.pitch || [a, b].some(x =>
            !(x.power > Math.max(1e-9, 2 * noise) && x.fraction >= 0.55 && x.ratio >= 1.8))) {
            return fail("PITCH_EVIDENCE", {offset, note: index});
        }
        tones.push({pitch: a.pitch, power: Math.min(a.power, b.power)});
    }
    if (guardPowers.some((power, index) => {
        const left = tones[index * 3 - 1]?.power ?? Infinity;
        const right = tones[index * 3]?.power ?? Infinity;
        return power >= Math.min(left, right) * 0.55;
    })) return fail("GAP_EVIDENCE", {offset});
    for (let i = 1; i < centers.length; i++) {
        if (i % 3 === 0) continue;
        const center = (centers[i - 1] + centers[i]) / 2 + offset;
        let quietest = Infinity;
        for (let shift = -288; shift <= 288; shift += 48) {
            const at = center + shift;
            const power = (energy[at + INNER_HALF_WINDOW] - energy[at - INNER_HALF_WINDOW])
                / (2 * INNER_HALF_WINDOW);
            quietest = Math.min(quietest, power);
        }
        const neighborPower = Math.min(tones[i - 1].power, tones[i].power);
        const originalRatio = quietest / neighborPower;
        const ratio = checkInnerGap ? checkInnerGap({energy, center, neighborPower}) : originalRatio;
        if (diagnostic) diagnostic.innerGaps.push({note: i, originalRatio, ratio, center});
        if (ratio >= 0.7) {
            return fail("INNER_GAP_EVIDENCE", {offset, note: i});
        }
    }
    const decoded = decodeC2EventFrame(eventsFromPitches(tones.map(({pitch}) => pitch)), endpoints);
    return decoded.ok ? {ok: true, header: decoded.header, meaning: decoded.meaning, offset} : decoded;
}
