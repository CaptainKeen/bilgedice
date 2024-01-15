
async function fetchJSON(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${path}`);
    }
    return await response.json();
}

async function loadStateEVs() {
    const json = await fetchJSON('evs.json');
    const evs = new Map();
    for (let idx = 0; idx < json.length; idx += 13) {
        const key = json.slice(idx, idx + 12).join(',');
        const ev = json[idx + 12];
        evs.set(key, ev);
    }
    return evs;
}

async function loadAI() {
    const json = await fetchJSON('ai.json');
    const aiTransitions = new Map();
    for (const [moveKey, distribution] of Object.entries(json)) {
        const distMap = new Map();
        for (const [resultKey, probability] of Object.entries(distribution)) {
            distMap.set(resultKey, probability);
        }
        aiTransitions.set(moveKey, distMap);
    }
    return aiTransitions;

}

const startTime = Date.now();
const evsPromise = loadStateEVs();
const aiPromise = loadAI();
Promise.all([evsPromise, aiPromise]).then(() => {
    console.log('Loaded in', Date.now() - startTime, 'ms');
});

const startingMoveEVs = [
    ["6,24,1,1", 0.9980722277513435],
    ["6,23,1,1", 0.9903859141119186],
    ["6,22,1,1", 0.9751318767536907],
    ["6,21,1,1", 0.9488156584228223],
    ["6,20,1,1", 0.9030079182109074],
    ["5,18,1,1", 0.8526941333452555],
    ["6,19,1,1", 0.8362420214898334],
    ["5,17,1,1", 0.775316659386799],
    ["6,18,1,1", 0.7551183557279479],
    ["5,16,1,1", 0.6848988406427093],
    ["6,17,1,1", 0.663151074086672],
    ["4,12,1,1", 0.6071721124030991],
    ["5,15,1,1", 0.5876176575487434],
    ["6,16,1,1", 0.5654108823567231],
    ["1,6,0,0", 0.5370722510681207],
    ["1,0,0,1", 0.5006086412334032],
    ["1,0,1,0", 0.4707476863621419],
    ["1,5,0,0", 0.44620086285691835],
    ["1,3,0,0", 0.2717005759267291],
    ["1,2,0,0", 0.20033465050844265]
];

const cache = new Map();

cache.set(tupleToKey(Array(12).fill(0)), new Map(startingMoveEVs));

addEventListener('message', async event => {

    const [state, board] = event.data;

    board.sort((a, b) => b - a);

    const stateKey = tupleToKey(state);
    if (!cache.has(stateKey)) {
        cache.set(stateKey, new Map());
    }
    const moveCache = cache.get(stateKey);

    let bestMove = null;
    let bestEV = -Infinity;
    for (const move of goodMoves(state, board)) {
        const moveKey = tupleToKey(move);
        if (board.length === 6 && !moveCache.has(moveKey)) {
            continue;
        }
        let ev;
        if (moveCache.has(moveKey)) {
            ev = moveCache.get(moveKey);
        } else {
            ev = await moveEV(state, move);
            moveCache.set(moveKey, ev);
        }
        if (ev > bestEV) {
            bestMove = move;
            bestEV = ev;
        }
    }
    postMessage([bestMove, bestEV]);

});

function tupleToKey(tuple) {
    return tuple.join(',');
}

function keyToTuple(key) {
    return key.split(',').map(x => parseInt(x));
}

function* goodMoves(state, board) {

    const canTakeQualifier = [false, false];
    let maxQualifiers = 0;
    [1, 4].forEach((qualifier, idx) => {
        const inHand = state[idx + 1];
        const inBoard = board.includes(qualifier);
        canTakeQualifier[idx] = !inHand && inBoard;
        if (inHand || inBoard) {
            ++maxQualifiers;
        }
    });
    const qualifiers = canTakeQualifier.map(canTake => canTake ? [1, 0] : [0]);

    if (maxQualifiers < 3 - board.length) {
        // can't qualify
        yield [board.length, -1, 0, 0];
        return;
    }

    for (let numMoveDice = 1; numMoveDice <= board.length; ++numMoveDice) {
        const minQualifiers = Math.max(0, numMoveDice - board.length + 2);
        for (const ones of qualifiers[0]) {
            for (const fours of qualifiers[1]) {
                const numScoringDice = numMoveDice - ones - fours;
                if (numScoringDice < 0) {
                    continue;
                }

                const endOnes = state[1] || ones;
                const endFours = state[2] || fours;
                if (endOnes + endFours < minQualifiers) {
                    continue;
                }

                let scoringDice = board.slice();
                const qualifierCount = [ones, fours];
                [1, 4].forEach((qualifier, idx) => {
                    if (qualifierCount[idx]) {
                        scoringDice.splice(scoringDice.indexOf(qualifier), 1);
                    } else if (canTakeQualifier[idx]) {
                        scoringDice = scoringDice.filter(d => d !== qualifier);
                    }
                });
                if (scoringDice.length < numScoringDice) {
                    continue;
                }

                let score = 0;
                for (let idx = 0; idx < numScoringDice; ++idx) {
                    score += scoringDice[idx];
                }
                yield [numMoveDice, score, endOnes, endFours];
            }
        }
    }

}

async function moveEV(state, move) {

    const [numHandDice] = state;
    const [numMoveDice, playerScoreDelta, endOne, endFour] = move;
    const numTotalDice = numHandDice + numMoveDice;
    const playerState = [numTotalDice, endOne, endFour];

    const aiTransitions = await aiPromise;

    const opponentDists = [];
    for (let idx = 3; idx <= 9; idx += 3) {
        const dist = new Map();
        const [score, one, four] = state.slice(idx, idx + 3);
        const key = tupleToKey([numHandDice, one, four, numMoveDice]);
        for (const [result, probability] of aiTransitions.get(key).entries()) {
            let [moveScoreDelta, endOne, endFour] = keyToTuple(result);
            let resultDiff = score + moveScoreDelta - playerScoreDelta;
            if (moveScoreDelta < 0) {
                resultDiff = -25;
            }
            const resultKey = tupleToKey([resultDiff, endOne, endFour]);
            if (dist.has(resultKey)) {
                dist.set(resultKey, dist.get(resultKey) + probability);
            } else {
                dist.set(resultKey, probability);
            }
        }
        opponentDists.push(dist);
    }

    const stateEVs = await evsPromise;

    let ev = 0;
    for (const [k0, p0] of opponentDists[0].entries()) {
        const s0 = keyToTuple(k0);
        for (const [k1, p1] of opponentDists[1].entries()) {
            const s1 = keyToTuple(k1);
            for (const [k2, p2] of opponentDists[2].entries()) {
                const s2 = keyToTuple(k2);
                const oppStates = [s0, s1, s2].sort(opponentStateCompare);
                const endState = [...playerState, ...oppStates[0], ...oppStates[1], ...oppStates[2]];
                const endStateKey = tupleToKey(endState);
                const p = p0 * p1 * p2;
                if (numTotalDice === 6) {
                    ev += p * result(endState);
                } else if (stateEVs.has(endStateKey)) {
                    ev += p * stateEVs.get(endStateKey);
                } else if (isGuaranteedWin(endState)) {
                    ev += p;
                } else if (!isGuaranteedLoss(endState)) {
                    throw new Error(`State ${endStateKey} not in DB`);
                }
            }
        }
    }
    return ev;

}

function opponentStateCompare(a, b) {
    return (a[0] !== b[0]) ? a[0] - b[0]
         : (a[1] !== b[1]) ? a[1] - b[1]
         : a[2] - b[2];
}

function result(state) {

    if (!state[1] || !state[2]) {
        return 0;
    }
    const maxOpponentDiff = Math.max(state[3], state[6], state[9]);
    return maxOpponentDiff < 0 ? 1 : 0;

}

function isGuaranteedWin(state) {

    const diceRemaining = 6 - state[0];
    const qualifiersNeeded = 2 - state[1] - state[2];
    if (qualifiersNeeded > 0) {
        return false;
    }

    const minPlayerScore = diceRemaining;
    for (let idx = 3; idx <= 9; idx += 3) {
        const oppQualifiersNeeded = 2 - state[idx + 1] - state[idx + 2];
        if (oppQualifiersNeeded > diceRemaining) {
            continue;
        }
        const maxScore = state[idx] + 6 * (diceRemaining - oppQualifiersNeeded);
        if (maxScore >= minPlayerScore) {
            return false;
        }
    }
    return true;

}

function isGuaranteedLoss(state) {

    const diceRemaining = 6 - state[0];
    const qualifiersNeeded = 2 - state[1] - state[2];
    if (qualifiersNeeded > diceRemaining) {
        return true;
    }

    const maxPlayerScore = 6 * (diceRemaining - qualifiersNeeded);
    for (let idx = 3; idx <= 9; idx += 3) {
        const oppQualifiersNeeded = 2 - state[idx + 1] - state[idx + 2];
        if (oppQualifiersNeeded > 0) {
            continue;
        }
        const minScore = state[idx] + diceRemaining;
        if (minScore > maxPlayerScore) {
            return true;
        }
    }
    return false;

}
