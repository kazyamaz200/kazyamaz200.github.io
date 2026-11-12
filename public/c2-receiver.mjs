// Phase 1 C2 receive contract, usable without browser or Node APIs.
export const C2 = Object.freeze({
    id: "WP03-C2-v1",
    sample_rate: 48000,
    frequencies: Object.freeze([523.2511, 587.3295, 659.2551, 783.9909, 880]),
    note_samples: 4320,
    inner_gap_samples: 1080,
    word_gap_samples: 4320,
    frame_gap_samples: 8640,
    amplitude: 0.35,
    ramp_samples: 432,
    detector_thresholds: Object.freeze({
        silence_ratio: 0.01,
        minimum_silence_note_fraction: 0.125,
        duration_tolerance: 0.1,
        central_window_fraction: 0.8,
        minimum_energy_fraction: 0.9,
        minimum_dominance: 4,
    }),
});

const words = [
    "REQ", "GRANT", "DENY", "ACK", "REPEAT", "A", "B", "POS", "NEG",
    "PASS", "WAIT", "LEFT", "RIGHT", "NONE", "BEGIN", "END", "NO_REPLY",
    "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7",
];
const motifWords = new Map(words.map((word, index) => [(37 * index) % 125, word]));
const wordMotifs = new Map([...motifWords].map(([motif, word]) => [word, motif]));
const digits = words.slice(17);
const agents = ["A", "B"];
const parties = [...agents, "NONE"];
const roles = [
    ["act", words.slice(0, 5)],
    ["speaker", parties],
    ["addressee", parties],
    ["polarity", ["POS", "NEG", "NONE"]],
    ["predicate", ["PASS", "WAIT", "NONE"]],
    ["actor", parties],
    ["reference", parties],
    ["side", ["LEFT", "RIGHT", "NONE"]],
];

const reject = (stage, code) => ({ok: false, stage, code});
const roundSamples = value => Math.floor(value + 0.5);

export function measureC2Pitch(samples, start, end) {
    let energy = 0;
    for (let i = start; i < end; i++) {
        energy += samples[i] ** 2;
    }
    const scores = C2.frequencies.map(frequency => {
        const omega = 2 * Math.PI * frequency / C2.sample_rate;
        let ss = 0, cc = 0, sc = 0, ys = 0, yc = 0;
        for (let i = start; i < end; i++) {
            const sine = Math.sin(omega * (i - start));
            const cosine = Math.cos(omega * (i - start));
            ss += sine * sine;
            cc += cosine * cosine;
            sc += sine * cosine;
            ys += samples[i] * sine;
            yc += samples[i] * cosine;
        }
        const determinant = ss * cc - sc * sc;
        const a = (ys * cc - yc * sc) / determinant;
        const b = (yc * ss - ys * sc) / determinant;
        return Math.max(0, Math.min(energy, a * ys + b * yc));
    });
    const order = scores.map((_, pitch) => pitch).sort((a, b) => scores[b] - scores[a]);
    const [best, second] = order.map(pitch => scores[pitch]);
    return {energy, scores, best, second, pitch: order[0]};
}

function detectPitch(samples, start, end) {
    const {energy, best, second, pitch} = measureC2Pitch(samples, start, end);
    const thresholds = C2.detector_thresholds;
    if (energy > 0 && best >= thresholds.minimum_energy_fraction * energy
        && best >= thresholds.minimum_dominance * second) {
        return pitch;
    }
    return null;
}

export function detectC2Events(samples, sampleRate) {
    const fail = code => reject("Sound.detect", code);
    if (!(samples instanceof Float64Array) || sampleRate !== C2.sample_rate) {
        return fail("AUDIO_UNDECODABLE");
    }
    if (samples.length > 10 * C2.sample_rate) return fail("RESOURCE_LIMIT");

    let peak = 0;
    for (const value of samples) {
        if (!Number.isFinite(value) || Math.abs(value) > 1) return fail("RESOURCE_LIMIT");
        peak = Math.max(peak, Math.abs(value));
    }
    if (peak === 0) return fail("AUDIO_UNDECODABLE");

    const thresholds = C2.detector_thresholds;
    const cutoff = thresholds.silence_ratio * peak;
    const minimum = roundSamples(C2.note_samples * thresholds.minimum_silence_note_fraction);
    const rests = [];
    let beginning = null;
    for (let i = 0; i <= samples.length; i++) {
        if (i < samples.length && Math.abs(samples[i]) <= cutoff) {
            beginning ??= i;
        } else if (beginning !== null) {
            if (i - beginning >= minimum) rests.push([beginning, i]);
            beginning = null;
        }
    }
    if (rests[0]?.[0] !== 0 || rests.at(-1)[1] !== samples.length) {
        return fail("AUDIO_TRUNCATED");
    }
    if (rests.length > 43) return fail("RESOURCE_LIMIT");

    const close = (actual, expected) =>
        Math.abs(actual - expected) <= thresholds.duration_tolerance * expected;
    const events = [];
    let cursor = 0;
    for (const [index, [start, end]] of rests.entries()) {
        if (start > cursor) {
            const length = start - cursor;
            if (!close(length, C2.note_samples)) return fail("AUDIO_UNDECODABLE");
            const pitch = detectPitch(samples, cursor + roundSamples(length / 10),
                cursor + roundSamples(9 * length / 10));
            if (pitch === null) return fail("AUDIO_UNDECODABLE");
            events.push({pitch});
        }
        const length = end - start;
        if (index === 0 || index === rests.length - 1) {
            if (!close(length, C2.frame_gap_samples)) return fail("AUDIO_TRUNCATED");
            events.push({rest: 8});
        } else if (close(length, C2.inner_gap_samples)) {
            events.push({rest: 1});
        } else if (close(length, C2.word_gap_samples)) {
            events.push({rest: 4});
        } else {
            return fail("AUDIO_UNDECODABLE");
        }
        cursor = end;
    }
    return {ok: true, events};
}

function decodeFrame(events, receiver, peer) {
    const melodyError = code => reject("Melody.decode", code);
    const frameError = code => reject("Frame.from_words", code);
    if (events.length !== 85 || events[0].rest !== 8 || events.at(-1).rest !== 8) {
        return melodyError("INVALID_FRAME");
    }
    const frame = [];
    for (let word = 0; word < 14; word++) {
        const start = 1 + 6 * word;
        const [a, gap1, b, gap2, c, separator] = events.slice(start, start + 6);
        if ([a, b, c].some(note => note.pitch === undefined)
            || gap1.rest !== 1 || gap2.rest !== 1 || separator.rest !== (word === 13 ? 8 : 4)) {
            return melodyError("INVALID_FRAME");
        }
        frame.push(motifWords.get(25 * a.pitch + 5 * b.pitch + c.pitch));
    }
    if ([0, 1, 2, 3, 4, 13].some(index => frame[index] === undefined)) {
        return melodyError("UNKNOWN_MOTIF");
    }
    const [begin, versionWord, sessionWord, seqWord, replyWord] = frame;
    const version = digits.indexOf(versionWord);
    const session = digits.indexOf(sessionWord);
    const seq = digits.indexOf(seqWord);
    const reply = replyWord === "NO_REPLY" ? null : digits.indexOf(replyWord);
    if (begin !== "BEGIN" || frame[13] !== "END"
        || [version, session, seq, reply].includes(-1)) return frameError("INVALID_FRAME");
    if (version !== 1) return frameError("UNSUPPORTED_VERSION");

    const body = frame.slice(5, 13);
    if (body.includes(undefined)) return melodyError("UNKNOWN_MOTIF");
    const [act, speaker, addressee] = body;
    if ((act === "REQ" && reply !== null) || (roles[0][1].slice(1).includes(act) && reply === null)
        || !agents.includes(receiver) || !agents.includes(peer) || receiver === peer
        || speaker !== peer || addressee !== receiver) return frameError("INVALID_FRAME");
    return {ok: true, header: {version, session, seq, reply}, body, words: frame};
}

function parseMeaning(body) {
    if (!roles.every(([, allowed], index) => allowed.includes(body[index]))) {
        return reject("Language.parse", "INVALID_SYNTAX");
    }
    const [act, , , polarity, predicate, actor, reference, side] = body;
    const validProposition = polarity !== "NONE" && agents.includes(actor)
        && ((predicate === "PASS" && agents.includes(reference) && reference !== actor && side !== "NONE")
            || (predicate === "WAIT" && reference === "NONE" && side === "NONE"));
    const valid = act === "REPEAT" ? body.slice(3).every(word => word === "NONE") : validProposition;
    if (!valid) return reject("Language.parse", "INVALID_MEANING");
    return {ok: true, meaning: Object.fromEntries(roles.map(([key], index) => [key, body[index]]))};
}

export function decodeC2Detailed(samples, sampleRate, {receiver, peer} = {}) {
    const sound = detectC2Events(samples, sampleRate);
    if (!sound.ok) return sound;
    const frame = decodeFrame(sound.events, receiver, peer);
    if (!frame.ok) return frame;
    const language = parseMeaning(frame.body);
    if (!language.ok) return language;
    return {ok: true, header: frame.header, meaning: language.meaning,
        words: frame.words, events: sound.events};
}

export function decodeC2(samples, sampleRate, endpoints) {
    const result = decodeC2Detailed(samples, sampleRate, endpoints);
    if (!result.ok) return result;
    return {ok: true, header: result.header, meaning: result.meaning};
}

export function c2WordPitches(word) {
    const value = wordMotifs.get(word);
    if (value === undefined) return null;
    return [Math.floor(value / 25), Math.floor(value / 5) % 5, value % 5];
}

export function encodeC2(meaning, header) {
    const body = roles.map(([key]) => meaning?.[key]);
    const parsed = parseMeaning(body);
    if (!parsed.ok || !agents.includes(body[1]) || !agents.includes(body[2]) || body[1] === body[2]) {
        return reject("Language.generate", "INVALID_MEANING");
    }
    const {version, session, seq, reply} = header ?? {};
    const isDigit = value => Number.isInteger(value) && value >= 0 && value < digits.length;
    const stage = "Frame.to_words";
    if (![version, session, seq].every(isDigit) || (reply !== null && !isDigit(reply))) {
        return reject(stage, "INVALID_FRAME");
    }
    if (version !== 1) return reject(stage, "UNSUPPORTED_VERSION");
    if ((body[0] === "REQ") !== (reply === null)) return reject(stage, "INVALID_FRAME");
    const frame = ["BEGIN", digits[version], digits[session], digits[seq],
        reply === null ? "NO_REPLY" : digits[reply], ...body, "END"];
    const events = [{rest: 8}];
    for (const [index, word] of frame.entries()) {
        if (index) events.push({rest: 4});
        const [a, b, c] = c2WordPitches(word);
        events.push({pitch: a}, {rest: 1}, {pitch: b}, {rest: 1}, {pitch: c});
    }
    events.push({rest: 8});
    return {ok: true, words: frame, events, ...renderC2Events(events)};
}

export function renderC2Events(events) {
    const stage = "Sound.render";
    if (!Array.isArray(events) || !events.length) return reject(stage, "INVALID_FRAME");
    if (events.length > 85) return reject(stage, "RESOURCE_LIMIT");
    const gaps = new Map([[1, C2.inner_gap_samples], [4, C2.word_gap_samples], [8, C2.frame_gap_samples]]);
    const lengths = events.map(event => {
        if (Number.isInteger(event?.pitch) && event.pitch >= 0 && event.pitch < C2.frequencies.length) {
            return C2.note_samples;
        }
        return event?.pitch === undefined ? gaps.get(event?.rest) : undefined;
    });
    if (lengths.includes(undefined)) return reject(stage, "INVALID_FRAME");
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (total > 10 * C2.sample_rate) return reject(stage, "RESOURCE_LIMIT");
    const samples = new Float64Array(total);
    let offset = 0;
    for (const [index, event] of events.entries()) {
        const length = lengths[index];
        if (event.pitch !== undefined) {
            const omega = 2 * Math.PI * C2.frequencies[event.pitch] / C2.sample_rate;
            for (let i = 0; i < length; i++) {
                const ramp = Math.min(1, i / C2.ramp_samples, (length - 1 - i) / C2.ramp_samples);
                samples[offset + i] = C2.amplitude * ramp * Math.sin(omega * i);
            }
        }
        offset += length;
    }
    return {ok: true, samples};
}
