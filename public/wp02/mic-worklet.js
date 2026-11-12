/* Preloaded as a self-contained module so arming works in an offline tab. */
class CapturePCM extends AudioWorkletProcessor {
    constructor() {
        super();
        this.samples = new Float32Array(1024);
        this.size = 0;
        this.nextFrame = null;
        this.waiting = new Map();
        this.pending = 0;
        this.published = false;
        this.startupGaps = 0;
        this.startupMissing = 0;
        this.port.onmessage = ({data}) => {
            if (this.waiting.has(data.ack)) {
                this.pending -= this.waiting.get(data.ack);
                this.waiting.delete(data.ack);
            }
        };
    }

    fail(code, detail = {}) {
        this.port.postMessage({error: code, ...detail});
        return false;
    }

    process(inputs) {
        const channels = inputs[0];
        const length = channels?.[0]?.length ?? 0;
        if (!length) {
            return !this.published || this.fail("CAPTURE_INTERRUPTED");
        }
        if (this.nextFrame !== null && this.nextFrame !== currentFrame) {
            const delta = currentFrame - this.nextFrame;
            if (this.published || delta < 0) {
                return this.fail(delta > 0 ? "CAPTURE_GAP" : "CAPTURE_OVERLAP", {delta});
            }
            // No PCM has reached the receiver. Start with a fresh contiguous
            // block, dropping the partial prefix without filling missing samples.
            this.size = 0;
            this.startupGaps++;
            this.startupMissing += delta;
        }
        if (channels.some(channel => channel.length !== length)) return this.fail("INVALID_CAPTURE_BLOCK");
        this.nextFrame = currentFrame + length;
        for (let i = 0; i < length; i++) {
            if (this.pending + this.size + 1 > sampleRate) return this.fail("CAPTURE_QUEUE_LIMIT");
            if (this.size === 0) {
                this.start = currentFrame + i;
                this.clip = 0;
                this.peak = 0;
            }
            let sum = 0;
            let peak = 0;
            for (const channel of channels) {
                if (!Number.isFinite(channel[i]) || Math.abs(channel[i]) > 1) {
                    return this.fail("INVALID_CAPTURE_SAMPLE");
                }
                sum += channel[i];
                peak = Math.max(peak, Math.abs(channel[i]));
            }
            this.clip += Number(peak >= 0.999);
            this.peak = Math.max(this.peak, peak);
            this.samples[this.size++] = sum / channels.length;
            if (this.size === this.samples.length) {
                this.published = true;
                this.pending += this.size;
                this.waiting.set(this.start, this.size);
                this.port.postMessage({start: this.start, samples: this.samples,
                    clip: this.clip, peak: this.peak, channels: channels.length,
                    startupGaps: this.startupGaps, startupMissing: this.startupMissing}, [this.samples.buffer]);
                this.size = 0;
                this.samples = new Float32Array(1024);
            }
        }
        return true;
    }
}

registerProcessor("capture-pcm", CapturePCM);
