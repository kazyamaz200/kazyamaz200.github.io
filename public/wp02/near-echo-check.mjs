// Compare one delayed copy against two on one common set of samples.
// This is a calibration experiment and does not change the W17 decision rules.
export function assessNearEcho(response, directIndex, candidateDelay) {
    const radius = 72;
    const search = 36;
    const start = directIndex + candidateDelay - radius;
    const end = directIndex + candidateDelay + radius + 1;
    if (start < 0 || end > response.length || start < candidateDelay + search) return null;
    const target = response.subarray(start, end);
    const targetEnergy = dot(target, target);
    const templates = [];
    for (let delay = Math.max(144, candidateDelay - search); delay <= Math.min(2400, candidateDelay + search); delay++) {
        const wave = response.subarray(start - delay, end - delay);
        const energy = dot(wave, wave);
        const projection = dot(target, wave);
        templates.push({delay, wave, energy, projection});
    }
    let singleResidual = targetEnergy;
    let pair;
    for (const [i, first] of templates.entries()) {
        const {energy: a, projection: u} = first;
        singleResidual = Math.min(singleResidual, targetEnergy - u * u / a);
        for (let j = i + 4; j < templates.length; j++) {
            const second = templates[j];
            const {energy: b, projection: v} = second;
            const cross = dot(first.wave, second.wave);
            const determinant = a * b - cross * cross;
            if (determinant < 0.05 * a * b) continue;
            const gainA = (b * u - cross * v) / determinant;
            const gainB = (a * v - cross * u) / determinant;
            if (Math.min(Math.abs(gainA), Math.abs(gainB)) < 0.06) continue;
            const residual = Math.max(0, targetEnergy - gainA * u - gainB * v);
            if (!pair || residual < pair.residual) {
                pair = {delays: [first.delay, second.delay], gains: [gainA, gainB], residual};
            }
        }
    }
    if (!pair || !targetEnergy || singleResidual <= 0) return null;
    return {...pair, singleResidualFraction: singleResidual / targetEnergy,
        explainedEnergyGain: (singleResidual - pair.residual) / targetEnergy,
        improvement: (singleResidual - pair.residual) / singleResidual};
}

function dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}
