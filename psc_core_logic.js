/**
 * PSC Operations - Core Calculation & Business Logic Module
 * Pure functions with strict validation and zero side-effects.
 */

function calculateYieldPct(sampleKg, peeledKg) {
    const sample = Number(sampleKg);
    const peeled = Number(peeledKg);

    if (!Number.isFinite(sample) || sample <= 0) {
        throw new TypeError("sampleKg must be a positive finite number");
    }

    if (!Number.isFinite(peeled) || peeled < 0) {
        throw new TypeError("peeledKg must be a non-negative finite number");
    }

    if (peeled > sample) {
        throw new RangeError("peeledKg cannot exceed sampleKg (Yield > 100%)");
    }

    return Number(((peeled / sample) * 100).toFixed(2));
}

function calculateTransitLoss(grossDispatchKg, netReceivedKg) {
    const gross = Number(grossDispatchKg);
    const received = Number(netReceivedKg);

    if (!Number.isFinite(gross) || gross <= 0) {
        throw new TypeError("grossDispatchKg must be a positive finite number");
    }

    if (!Number.isFinite(received) || received < 0) {
        throw new TypeError("netReceivedKg must be a non-negative finite number");
    }

    if (received > gross) {
        throw new RangeError("netReceivedKg cannot exceed grossDispatchKg");
    }

    const lossKg = Number((gross - received).toFixed(2));
    const lossPct = Number(((lossKg / gross) * 100).toFixed(2));

    return { lossKg, lossPct };
}

module.exports = {
    calculateYieldPct,
    calculateTransitLoss
};
