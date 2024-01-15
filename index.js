
const worker = new Worker('worker.js');

const playerRolls = document.querySelector('#player-rolls');
const playerHand = document.querySelector('#player-hand');
const opponentHands = [
    document.querySelector('#opponent-hand-1'),
    document.querySelector('#opponent-hand-2'),
    document.querySelector('#opponent-hand-3')
];
const submitButton = document.querySelector('#submit');

const moveRow = document.querySelector('#move-row');
const diceDivs = document.querySelectorAll('.dice-container');
const diceImages = document.querySelectorAll('.dice-image');
const diceLabels = document.querySelectorAll('.dice-label');
const winrateSpan = document.querySelector('#winrate');

document.querySelectorAll('.dice-input').forEach(input => {
    input.addEventListener('input', event => {
        const matches = input.value.match(/[1-6]/g);
        if (matches === null) {
            input.value = '';
        } else {
            input.value = matches.slice(0, 6).join('');
        }
        input.classList.remove('is-invalid');
    });
});

submitButton.addEventListener('click', async event => {

    if (!validateInput()) {
        return;
    }

    const [state, board] = parseInput();

    submitButton.disabled = true;
    clearMove();

    const [move, ev] = await solve(state, board);

    if (move[1] < 0) {
        // unwinnable state
        showMove(board, ev);
    } else {
        let remaining = move[0];
        let keepable = board.slice().sort((a, b) => b - a);
        const kept = [];
        [1, 4].forEach((qualifier, idx) => {
            if (!state[idx + 1]) {
                if (move[idx + 2]) {
                    keepable.splice(keepable.indexOf(qualifier), 1);
                    kept.push(qualifier);
                    --remaining;
                } else {
                    keepable = keepable.filter(d => d !== qualifier);
                }
            }
        });
        kept.push(...keepable.slice(0, remaining));
        let orderedKept = [];
        for (const die of board) {
            const idx = kept.indexOf(die);
            if (idx !== -1) {
                orderedKept.push(kept[idx]);
                kept.splice(idx, 1);
            }
        }
        showMove(orderedKept, ev);
    }
    submitButton.disabled = false;

});

function validateInput() {

    if (playerRolls.value.length === 0) {
        playerRolls.classList.add('is-invalid');
        playerHand.classList.remove('is-invalid');
        for (const opponentHand of opponentHands) {
            opponentHand.classList.remove('is-invalid');
        }
        return false;
    } else {
        playerRolls.classList.remove('is-invalid');
    }

    if (playerHand.value.length !== 6 - playerRolls.value.length) {
        playerHand.classList.add('is-invalid');
        for (const opponentHand of opponentHands) {
            opponentHand.classList.remove('is-invalid');
        }
        return false;
    } else {
        playerHand.classList.remove('is-invalid');
    }

    let isValid = true;

    for (const opponentHand of opponentHands) {
        if (opponentHand.value.length !== playerHand.value.length) {
            opponentHand.classList.add('is-invalid');
            isValid = false;
        } else {
            opponentHand.classList.remove('is-invalid');
        }
    }

    return isValid;

}

function parseInput() {

    const inputs = [playerHand, ...opponentHands, playerRolls];
    const dice = inputs.map(input => input.value.split('').map(n => parseInt(n)));
    const hands = dice.slice(0, 4).map(hand => {
        let score = 0;
        let one = 0;
        let four = 0;
        for (const die of hand) {
            if (die === 1 && !one) {
                one = 1;
            } else if (die === 4 && !four) {
                four = 1;
            } else {
                score += die;
            }
        }
        return [score, one, four];
    });

    const state = [dice[0].length, hands[0][1], hands[0][2]];
    hands.slice(1).sort(opponentStateCompare).forEach(([score, one, four]) => {
        state.push(score - hands[0][0], one, four);
    });

    return [state, dice[4]];

}

function opponentStateCompare(a, b) {
    return (a[0] !== b[0]) ? a[0] - b[0]
         : (a[1] !== b[1]) ? a[1] - b[1]
         : a[2] - b[2];
}

function solve(state, board) {

    return new Promise(resolve => {
        const messageListener = (event) => {
            worker.removeEventListener('message', messageListener);
            resolve(event.data);
        };
        worker.addEventListener('message', messageListener);
        worker.postMessage([state, board]);
    });

}

function clearMove() {

    for (let idx = 0; idx < 6; ++idx) {
        diceDivs[idx].classList.add('d-none');
        for (let d = 1; d <= 6; ++d) {
            diceImages[idx].classList.remove(`dice-${d}`);
        }
    }
    winrateSpan.innerText = '';

}

function showMove(dice, winrate) {

    for (let idx = 0; idx < dice.length; ++idx) {
        diceDivs[idx].classList.remove('d-none');
        diceImages[idx].classList.add(`dice-${dice[idx]}`);
        diceLabels[idx].innerText = dice[idx].toString();
    }
    const percentageString = winrate.toLocaleString(undefined, {
        style: 'percent',
        maximumFractionDigits: 4
    });
    winrateSpan.innerText = `${percentageString} chance to win`;
    moveRow.scrollIntoView({ behavior: 'instant', block: 'end' });

}
