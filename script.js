const questionSection = document.querySelector(".question");
const eyebrowEl = document.querySelector(".eyebrow");
const challengeLabelEl = document.querySelector(".challenge-label");
const descriptionEl = document.querySelector(".description");
const hintEl = document.querySelector("#hint");
const blockPool = document.querySelector("#block-pool");
const dropArea = document.querySelector(".drop-area");
const evaluateButton = document.querySelector(".evaluate");
const resultEl = document.querySelector("#result");
const timerEl = document.querySelector("#timer");

const startOverlay = document.querySelector("#start-overlay");

const difficultyOverlay = document.querySelector("#difficulty-overlay");
const difficultyContent = document.querySelector(".difficulty-content");
const difficultyEasyBtn = document.querySelector("#difficulty-easy");
const difficultyIntermediateBtn = document.querySelector("#difficulty-intermediate");
const challengeModeBtn = document.querySelector("#challenge-mode-btn");

const successOverlay = document.querySelector("#success-overlay");
const successTime = document.querySelector("#success-time");
const successNoteEl = document.querySelector("#success-note");
const successDismiss = document.querySelector("#success-dismiss");

const jumpFlash = document.querySelector("#jump-flash");

let draggedBlock = null;


/* -------------------------
   Mini compiler

   The old check compared the
   placed sequence against ONE
   hardcoded correct order —
   so independent steps that
   could legally go in either
   order (like two unrelated
   reads) got marked wrong for
   being "out of order" when
   they weren't actually wrong.

   This replaces that with an
   actual build-and-run step:
   each block carries a `kind`
   plus the logic behind it
   (a condition function, an
   expression, etc.), and
   `checkSolution` assembles
   whatever the visitor placed
   into a real program (respecting
   the ‹ › indentation as
   branch/loop nesting) and runs
   it against a few test inputs,
   just like an online judge
   would. Any arrangement that
   produces the right output for
   every test case passes — a
   swapped pair of independent
   statements still runs fine
   and still passes; a step used
   before it's read, a missing
   branch, or a decoy folded in
   changes the output and fails,
   without a special-cased rule
   for any of those specifically.
------------------------- */

class StructuralError extends Error {}


// Thrown by a "return" fragment to unwind out of however many
// loops/branches it's nested in, immediately — the same way an
// actual `return` statement would. Caught once, at the top of
// runProgram.

class ReturnSignal {

    constructor(value) {
        this.value = value;
    }

}


/* buildProgram used to track a single "currently open header,"
   which only supports ONE level of nesting — fine for an if/else
   or a lone loop, but not for a loop nested inside a loop (which
   Challenge Mode's brute-force TwoSum needs). This tracks a full
   stack instead: stack[k] is the container that an indent of k+1
   attaches to. Stepping back to a shallower indent just truncates
   the stack — closing whatever was open deeper than that, the
   same way dedenting closes a block in real code. */

function buildProgram(sequence) {

    const program = [];
    const stack = []; // stack[k] = { node, mode: "body" | "else" }

    function targetList(indent) {

        if (indent === 0) return program;

        const container = stack[indent - 1];

        return container.mode === "body"
            ? container.node.body
            : container.node.elseBody;

    }

    for (const item of sequence) {

        const { descriptor, indent } = item;

        if (indent > stack.length) {

            throw new StructuralError(
                "A nested fragment needs a branch or loop above it to belong to."
            );

        }

        // Dedent: anything open deeper than this indent is done.
        stack.length = indent;

        if (descriptor.kind === "else") {

            const list = targetList(indent);
            const last = list[list.length - 1];

            if (!last || last.kind !== "if" || last.elseBody !== null) {

                throw new StructuralError(
                    "`else:` has to directly follow a completed `if` branch."
                );

            }

            last.elseBody = [];
            stack[indent] = {
                node: last,
                mode: "else"
            };

            continue;

        }

        const node = { ...descriptor };

        const isContainer =
            descriptor.kind === "if" ||
            descriptor.kind === "for" ||
            descriptor.kind === "forEach" ||
            descriptor.kind === "forRange";

        if (isContainer) {

            node.body = [];

            if (descriptor.kind === "if") {
                node.elseBody = null;
            }

        }

        targetList(indent).push(node);

        if (isContainer) {

            stack[indent] = {
                node,
                mode: "body"
            };

        }

    }

    return program;

}


function runProgram(program, input) {

    const state = {};
    const cursor = { i: 0 };
    const output = [];

    function execList(list) {

        for (const node of list) {
            execNode(node);
        }

    }

    function execNode(node) {

        switch (node.kind) {

            case "read":

                state[node.varName] = input[node.varName];

                break;


            case "assign":

                state[node.varName] = node.expr(state);

                break;


            case "if":

                if (node.cond(state)) {

                    execList(node.body);

                } else if (node.elseBody) {

                    execList(node.elseBody);

                }

                break;


            case "for": {

                const count = state[node.countVar];

                if (!Number.isFinite(count)) {
                    throw new Error(node.countVar + " isn't a number yet");
                }

                for (let i = 0; i < count; i++) {

                    state[node.loopVar] = i;

                    execList(node.body || []);

                }

                break;

            }


            case "forEach": {

                const arr = state[node.arrayVar];

                if (!Array.isArray(arr)) {
                    throw new Error(node.arrayVar + " isn't a list yet");
                }

                for (let idx = 0; idx < arr.length; idx++) {

                    state[node.indexVar] = idx;
                    state[node.valueVar] = arr[idx];

                    execList(node.body || []);

                }

                break;

            }


            case "forRange": {

                const start = node.start(state);
                const end = node.end(state);

                for (let v = start; v < end; v++) {

                    state[node.loopVar] = v;

                    execList(node.body || []);

                }

                break;

            }


            case "mapSet": {

                const map = state[node.mapVar];

                if (!map || typeof map !== "object") {
                    throw new Error(node.mapVar + " isn't a map yet");
                }

                map[node.keyExpr(state)] = node.valueExpr(state);

                break;

            }


            case "return":

                throw new ReturnSignal(node.value(state));


            case "readAdd": {

                const numbers = input.numbers || [];
                const value = numbers[cursor.i];

                cursor.i += 1;

                if (typeof state[node.varName] !== "number") {
                    throw new Error(node.varName + " was never initialized");
                }

                state[node.varName] += value;

                break;

            }


            case "print":

                output.push(String(node.value(state)));

                break;


            default:

                throw new Error("Unknown fragment kind: " + node.kind);

        }

    }

    try {

        execList(program);

    } catch (err) {

        if (err instanceof ReturnSignal) {

            output.push(String(err.value));

            return output;

        }

        throw err;

    }

    return output;

}


function checkSolution(sequence, question) {

    let program;

    try {

        program = buildProgram(sequence);

    } catch (err) {

        return {
            correct: false,
            message: err.message || "That arrangement doesn't form a valid structure."
        };

    }

    for (const testCase of question.testCases) {

        let output;

        try {

            output = runProgram(program, testCase.input);

        } catch (err) {

            return {
                correct: false,
                message: "That arrangement doesn't run cleanly — check the order and nesting."
            };

        }

        const expected = testCase.expected.map(String);

        const matches =
            output.length === expected.length &&
            output.every((line, i) => line === expected[i]);

        if (!matches) {

            return {
                correct: false,
                message: "Not stable yet. Check the order — and nesting — of your fragments."
            };

        }

    }

    return {
        correct: true
    };

}


/* -------------------------
   Questions

   Each block is a descriptor,
   not just display text: a
   `kind` plus whatever logic
   that kind needs (a `cond`
   function, an `expr`, a
   `value` to print...). That's
   what the compiler above
   builds and runs. `text` is
   only for display and as the
   lookup key back to the
   descriptor.

   Any block text used as a
   value (like N) is named on
   the block itself rather
   than assuming the reader
   already knows the
   convention.
------------------------- */

const QUESTIONS = {

    easy: {

        description: "Distortions in the timeline destroyed the algorithm to check the parity (odd/even) of a number, N. Piece the fragments back to verify N's parity. Be advised - some fragments may not be needed.",

        hint: "Use the ‹ › arrows on a fragment to nest it inside the branch.",

        requiresIndent: true,

        maxIndent: 1,

        blocks: [

            {
                text: "Read N",
                kind: "read",
                varName: "N"
            },

            {
                text: "if N % 2 == 0:",
                kind: "if",
                cond: state => state.N % 2 === 0
            },

            {
                text: 'print("Even")',
                kind: "print",
                value: () => "Even"
            },

            {
                text: "else:",
                kind: "else"
            },

            {
                text: 'print("Odd")',
                kind: "print",
                value: () => "Odd"
            },

            {
                text: 'print("Maybe")',
                kind: "print",
                value: () => "Maybe"
            }

        ],

        testCases: [

            {
                input: { N: 4 },
                expected: ["Even"]
            },

            {
                input: { N: 7 },
                expected: ["Odd"]
            },

            {
                input: { N: 0 },
                expected: ["Even"]
            },

            {
                input: { N: -3 },
                expected: ["Odd"]
            }

        ]

    },


    intermediate: {

        description: "A signal from the past gives you N, then N numbers. Loop through them to stabilize the total. Some fragments may not be needed.",

        hint: "Use the ‹ › arrows on a fragment to nest it inside the loop.",

        requiresIndent: true,

        maxIndent: 1,

        blocks: [

            {
                text: "Read N (the count of numbers)",
                kind: "read",
                varName: "N"
            },

            {
                text: "sum = 0",
                kind: "assign",
                varName: "sum",
                expr: () => 0
            },

            {
                text: "for i in range(N):",
                kind: "for",
                loopVar: "i",
                countVar: "N"
            },

            {
                text: "read a number, add it to sum",
                kind: "readAdd",
                varName: "sum"
            },

            {
                text: "Print sum",
                kind: "print",
                value: state => state.sum
            },

            {
                text: "Print N",
                kind: "print",
                value: state => state.N
            }

        ],

        testCases: [

            {
                input: {
                    N: 3,
                    numbers: [3, 5, 2]
                },
                expected: [10]
            },

            {
                input: {
                    N: 2,
                    numbers: [10, 10]
                },
                expected: [20]
            },

            {
                input: {
                    N: 4,
                    numbers: [1, 1, 1, 1]
                },
                expected: [4]
            }

        ]

    },


    /* Challenge Mode is CookOff-level rather than Expo-pace.
       It is exposed as a separate mode button on the difficulty
       screen, while the "C" shortcut remains available as a
       convenience. TwoSum accepts both a brute-force scan and
       the faster hashmap approach: the compiler runs whatever
       is built, so both naturally pass on their own merits.
       `tag: "bruteforce"` flags the slower approach afterward
       via getSequenceNote(). */

    challenge: {

        eyebrow: "RESTRICTED ANOMALY — CHALLENGE MODE",

        headerLabel: "CHALLENGE MODE",

        description: "This one isn't tuned for a walkthrough — it's TwoSum. Given nums and a target, return the indices of the two entries that sum to it. A brute-force scan and a faster single-pass approach are both accepted.",

        hint: "Use ‹ › to nest fragments up to three levels deep — build either the nested-loop scan or the hashmap approach.",

        requiresIndent: true,

        maxIndent: 3,

        notes: [

            {
                tag: "bruteforce",
                message: "Stabilized — but this ran in O(n²). A faster route through this anomaly exists."
            }

        ],

        blocks: [

            {
                text: "Read nums",
                kind: "read",
                varName: "nums"
            },

            {
                text: "Read target",
                kind: "read",
                varName: "target"
            },

            {
                text: "seen = {}",
                kind: "assign",
                varName: "seen",
                expr: () => ({})
            },

            {
                text: "for i, num in enumerate(nums):",
                kind: "forEach",
                arrayVar: "nums",
                indexVar: "i",
                valueVar: "num"
            },

            {
                text: "complement = target - num",
                kind: "assign",
                varName: "complement",
                expr: state => state.target - state.num
            },

            {
                text: "if complement in seen:",
                kind: "if",
                cond: state =>
                    Object.prototype.hasOwnProperty.call(
                        state.seen,
                        state.complement
                    )
            },

            {
                text: "return [seen[complement], i]",
                kind: "return",
                value: state => [
                    state.seen[state.complement],
                    state.i
                ]
            },

            {
                text: "seen[num] = i",
                kind: "mapSet",
                mapVar: "seen",
                keyExpr: state => state.num,
                valueExpr: state => state.i
            },


            {
                text: "for i in range(len(nums)):",
                kind: "forRange",
                loopVar: "i",
                start: () => 0,
                end: state => state.nums.length,
                tag: "bruteforce"
            },

            {
                text: "for j in range(i + 1, len(nums)):",
                kind: "forRange",
                loopVar: "j",
                start: state => state.i + 1,
                end: state => state.nums.length,
                tag: "bruteforce"
            },

            {
                text: "if nums[i] + nums[j] == target:",
                kind: "if",
                cond: state =>
                    state.nums[state.i] + state.nums[state.j] === state.target,
                tag: "bruteforce"
            },

            {
                text: "return [i, j]",
                kind: "return",
                value: state => [
                    state.i,
                    state.j
                ],
                tag: "bruteforce"
            },


            {
                text: "return []",
                kind: "return",
                value: () => []
            },

            {
                text: "seen[i] = num",
                kind: "mapSet",
                mapVar: "seen",
                keyExpr: state => state.i,
                valueExpr: state => state.num
            }

        ],

        testCases: [

            {
                input: {
                    nums: [2, 7, 11, 15],
                    target: 9
                },
                expected: [[0, 1]]
            },

            {
                input: {
                    nums: [3, 2, 4],
                    target: 6
                },
                expected: [[1, 2]]
            },

            {
                input: {
                    nums: [3, 3],
                    target: 6
                },
                expected: [[0, 1]]
            },

            {
                input: {
                    nums: [1, 2, 3, 9],
                    target: 10
                },
                expected: [[0, 3]]
            }

        ]

    }

};


let currentQuestion = QUESTIONS.easy;

let blockDescriptorsByText =
    new Map(currentQuestion.blocks.map(b => [b.text, b]));


/* -------------------------
   Shuffle — the pool used to
   list blocks in the same
   order as the answer (plus
   a decoy tacked on the end),
   which meant there was
   nothing to actually order.
------------------------- */

function shuffle(array) {

    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j], result[i]];

    }

    return result;

}


/* -------------------------
   Block creation
------------------------- */

function setBlockIndent(block, level) {

    const maxIndent =
        parseInt(block.dataset.maxIndent || "1", 10);

    const clamped =
        Math.max(0, Math.min(maxIndent, level));

    block.dataset.indent = String(clamped);

    block.style.setProperty("--indent-level", clamped);

    block.classList.toggle("indented", clamped > 0);

    const outdentBtn =
        block.querySelector(".indent-btn.outdent");

    const indentBtn =
        block.querySelector(".indent-btn.indent");

    if (outdentBtn) {
        outdentBtn.disabled = clamped === 0;
    }

    if (indentBtn) {
        indentBtn.disabled = clamped >= maxIndent;
    }

}


function createBlock(text, requiresIndent, maxIndent) {

    const block = document.createElement("div");

    block.className = "block";
    block.draggable = true;

    block.dataset.text = text;
    block.dataset.indent = "0";
    block.dataset.maxIndent = String(maxIndent || 1);

    const textSpan = document.createElement("span");

    textSpan.className = "block-text";
    textSpan.textContent = text;

    block.appendChild(textSpan);


    if (requiresIndent) {

        const controls = document.createElement("span");

        controls.className = "block-indent-controls";


        const outdentBtn = document.createElement("button");

        outdentBtn.type = "button";
        outdentBtn.className = "indent-btn outdent";
        outdentBtn.textContent = "‹";
        outdentBtn.draggable = false;
        outdentBtn.disabled = true;

        outdentBtn.setAttribute(
            "aria-label",
            "Outdent this line"
        );

        outdentBtn.title = "Outdent this line";


        const indentBtn = document.createElement("button");

        indentBtn.type = "button";
        indentBtn.className = "indent-btn indent";
        indentBtn.textContent = "›";
        indentBtn.draggable = false;

        indentBtn.setAttribute(
            "aria-label",
            "Indent this line"
        );

        indentBtn.title = "Indent this line";


        outdentBtn.addEventListener(
            "mousedown",
            event => event.stopPropagation()
        );

        indentBtn.addEventListener(
            "mousedown",
            event => event.stopPropagation()
        );


        outdentBtn.addEventListener("click", event => {

            event.stopPropagation();

            setBlockIndent(
                block,
                parseInt(block.dataset.indent, 10) - 1
            );

        });


        indentBtn.addEventListener("click", event => {

            event.stopPropagation();

            setBlockIndent(
                block,
                parseInt(block.dataset.indent, 10) + 1
            );

        });


        controls.appendChild(outdentBtn);
        controls.appendChild(indentBtn);

        block.appendChild(controls);

    }


    attachDragHandlers(block);

    return block;

}


function loadQuestion(key) {

    const question = QUESTIONS[key];

    currentQuestion = question;

    blockDescriptorsByText =
        new Map(question.blocks.map(b => [b.text, b]));


    eyebrowEl.textContent =
        question.eyebrow || "TIMELINE ANOMALY DETECTED";

    challengeLabelEl.textContent =
        question.headerLabel || "TEMPORAL CHALLENGE";

    descriptionEl.textContent =
        question.description;

    hintEl.textContent =
        question.hint || "";


    // Clear anything left over from a previous round —
    // both the pool and, just in case, the playground.

    blockPool.innerHTML = "";

    dropArea
        .querySelectorAll(".block")
        .forEach(block => block.remove());


    shuffle(question.blocks).forEach(descriptor => {

        blockPool.appendChild(
            createBlock(
                descriptor.text,
                question.requiresIndent,
                question.maxIndent
            )
        );

    });


    updateDropArea();

}


/* -------------------------
   Jump flash

   A quick chromatic flicker layered on TOP of the overlay
   crossfade below — purely decorative, never a replacement
   for the fade sequencing that keeps the page from being
   uncovered mid-transition.
------------------------- */

function triggerJumpFlash() {

    jumpFlash.classList.remove("active");

    // restart the animation even on back-to-back transitions
    void jumpFlash.offsetWidth;

    jumpFlash.classList.add("active");

}


/* -------------------------
   Overlay sequencing

   Crossfading two overlays by
   just toggling both opacities
   at once leaves a gap where
   BOTH are semi-transparent
   and the real page underneath
   peeks through. Instead: bring
   the incoming overlay (which
   must sit at a higher z-index)
   fully opaque on top of the
   still-opaque outgoing one,
   and only then hide the
   outgoing one — so the page
   is never uncovered.
------------------------- */

function switchOverlay(fromOverlay, toOverlay, afterSwitch) {

    triggerJumpFlash();

    // Make absolutely sure the incoming overlay is above
    // the outgoing overlay for the entire transition.
    toOverlay.style.zIndex = "20";
    fromOverlay.style.zIndex = "10";

    // Bring the incoming overlay in first.
    toOverlay.classList.add("active");

    function handleTransitionEnd(event) {

        if (
            event.target !== toOverlay ||
            event.propertyName !== "opacity"
        ) {
            return;
        }

        toOverlay.removeEventListener(
            "transitionend",
            handleTransitionEnd
        );

        // The incoming overlay is now fully opaque,
        // so it is safe to remove the outgoing one.
        fromOverlay.classList.remove("active");

        // Restore the normal stacking order.
        toOverlay.style.zIndex = "";
        fromOverlay.style.zIndex = "";

        if (afterSwitch) {
            afterSwitch();
        }
    }

    toOverlay.addEventListener(
        "transitionend",
        handleTransitionEnd
    );
}



/* -------------------------
   Difficulty intro — the
   question crawls in and the
   two options roll out after
   it. Re-triggered on every
   visit to the screen, so the
   "intro" class is stripped
   and reflowed first, or a
   second visitor mid-session
   would just see the end
   state with no animation.
------------------------- */

function playDifficultyIntro() {

    difficultyContent.classList.remove("intro");

    // restart the animations even on back-to-back visits
    void difficultyContent.offsetWidth;

    difficultyContent.classList.add("intro");

}


/* -------------------------
   Start / idle screen
------------------------- */

function beginChallenge() {

    if (!startOverlay.classList.contains("active")) {
        return;
    }

    playDifficultyIntro();

    switchOverlay(
        startOverlay,
        difficultyOverlay
    );

}


/* -------------------------
   Challenge Mode
------------------------- */

function enterChallengeMode() {

    if (!difficultyOverlay.classList.contains("active")) {
        return;
    }

    // Load the challenge while the mode screen still covers
    // the page, then reveal it as a normal mode transition.

    triggerJumpFlash();

    loadQuestion("challenge");

    difficultyOverlay.classList.remove("active");

}


/* -------------------------
   Start / idle screen
------------------------- */

startOverlay.addEventListener(
    "click",
    beginChallenge
);


window.addEventListener("keydown", event => {

    // Keep the original C shortcut as a convenience, but route
    // it through the same visible Challenge Mode flow.

    if (event.key.toLowerCase() === "c") {

        if (startOverlay.classList.contains("active")) {

            playDifficultyIntro();

            switchOverlay(
                startOverlay,
                difficultyOverlay
            );

        } else if (
            difficultyOverlay.classList.contains("active")
        ) {

            enterChallengeMode();

        }

        return;

    }

    beginChallenge();

});


/* -------------------------
   Difficulty / mode select
------------------------- */

difficultyEasyBtn.addEventListener(
    "click",
    () => chooseDifficulty("easy")
);

difficultyIntermediateBtn.addEventListener(
    "click",
    () => chooseDifficulty("intermediate")
);

challengeModeBtn.addEventListener(
    "click",
    enterChallengeMode
);


function chooseDifficulty(key) {

    // Load the new question while the difficulty screen
    // still fully covers the page, then reveal it — a
    // plain single-layer fade is fine here since there's
    // no second overlay to leave a gap with. Still gets
    // the jump flash, since this is a "jump" too.

    triggerJumpFlash();

    loadQuestion(key);

    difficultyOverlay.classList.remove("active");

}


/* -------------------------
   Timer
------------------------- */

let timerStart = null;
let timerInterval = null;


function startTimer() {

    if (timerStart !== null) {
        return;
    }

    timerStart = performance.now();

    timerEl.classList.add("running");

    timerInterval =
        setInterval(updateTimerDisplay, 30);

}


function updateTimerDisplay() {

    if (timerStart === null) {
        return;
    }

    const elapsed =
        (performance.now() - timerStart) / 1000;

    timerEl.textContent =
        "T+ " + elapsed.toFixed(2) + "s";

}


function stopTimer() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;

    }

    if (timerStart === null) {
        return 0;
    }

    const elapsed =
        (performance.now() - timerStart) / 1000;

    timerStart = null;

    return elapsed;

}


function resetTimer() {

    stopTimer();

    timerEl.classList.remove("running");

    timerEl.textContent =
        "T+ 00.00s";

}


/* -------------------------
   Dragging (delegated so it
   works for blocks moved
   between panels, and for
   blocks created dynamically
   per question)
------------------------- */

function attachDragHandlers(block) {

    block.addEventListener("dragstart", () => {

        draggedBlock = block;

        block.classList.add("dragging");

        // The first pickup is what starts the clock —
        // that's when the visitor actually begins.

        startTimer();

    });


    block.addEventListener("dragend", () => {

        block.classList.remove("dragging");

        draggedBlock = null;

    });

}


/* -------------------------
   Drop into playground
------------------------- */

dropArea.addEventListener("dragover", event => {

    event.preventDefault();

    dropArea.classList.add("drag-over");

    if (!draggedBlock) {
        return;
    }

    const afterElement =
        getDragAfterElement(
            dropArea,
            event.clientY
        );


    if (afterElement == null) {

        dropArea.appendChild(
            draggedBlock
        );

    } else {

        dropArea.insertBefore(
            draggedBlock,
            afterElement
        );

    }

});


dropArea.addEventListener("dragleave", event => {

    if (event.target === dropArea) {

        dropArea.classList.remove(
            "drag-over"
        );

    }

});


dropArea.addEventListener("drop", event => {

    event.preventDefault();

    dropArea.classList.remove(
        "drag-over"
    );

    if (!draggedBlock) {
        return;
    }

    draggedBlock.classList.add("placed");

    updateDropArea();

});


function getDragAfterElement(container, y) {

    const draggableElements = [
        ...container.querySelectorAll(
            ".block:not(.dragging)"
        )
    ];


    return draggableElements.reduce(
        (closest, child) => {

            const box =
                child.getBoundingClientRect();

            const offset =
                y -
                box.top -
                box.height / 2;


            if (
                offset < 0 &&
                offset > closest.offset
            ) {

                return {
                    offset: offset,
                    element: child
                };

            }


            return closest;

        },
        {
            offset: Number.NEGATIVE_INFINITY,
            element: null
        }
    ).element;

}


/* -------------------------
   Drop back onto the pool
   (lets a visitor undo a
   wrong pick without a
   volunteer stepping in)
------------------------- */

blockPool.addEventListener("dragover", event => {

    event.preventDefault();

    blockPool.classList.add(
        "pool-over"
    );

});


blockPool.addEventListener("dragleave", event => {

    if (event.target === blockPool) {

        blockPool.classList.remove(
            "pool-over"
        );

    }

});


blockPool.addEventListener("drop", event => {

    event.preventDefault();

    blockPool.classList.remove(
        "pool-over"
    );

    if (!draggedBlock) {
        return;
    }

    draggedBlock.classList.remove(
        "placed"
    );

    setBlockIndent(
        draggedBlock,
        0
    );

    blockPool.appendChild(
        draggedBlock
    );

    updateDropArea();

});


/* -------------------------
   Evaluate
------------------------- */

evaluateButton.addEventListener("click", () => {

    const sequence = [
        ...dropArea.querySelectorAll(".block")
    ].map(block => ({

        descriptor:
            blockDescriptorsByText.get(
                block.dataset.text
            ),

        indent:
            parseInt(
                block.dataset.indent,
                10
            )

    }));


    const result =
        checkSolution(
            sequence,
            currentQuestion
        );


    if (result.correct) {

        const elapsed =
            stopTimer();

        showSuccess(
            elapsed,
            getSequenceNote(
                sequence,
                currentQuestion
            )
        );

    } else {

        showResult(
            result.message
        );

        dropArea.classList.remove(
            "shake"
        );

        // restart the animation even on back-to-back misses
        void dropArea.offsetWidth;

        dropArea.classList.add(
            "shake"
        );

    }

});


/* -------------------------
   Result message (inline,
   for the "not yet" case).
   The element itself lives
   permanently in the markup
   with its height reserved,
   so showing/hiding it never
   reflows the button beside
   it — only opacity changes.
------------------------- */

function showResult(message) {

    resultEl.textContent =
        message;

    resultEl.classList.add(
        "visible",
        "failure"
    );

    resultEl.classList.remove(
        "success"
    );

}


function clearResult() {

    resultEl.classList.remove(
        "visible",
        "success",
        "failure"
    );

    resultEl.textContent = "";

}


/* -------------------------
   Success reveal

   Correctness alone doesn't distinguish approach — the
   interpreter just runs whatever was built, so a brute-force
   scan and a hashmap pass both come back `correct: true` on
   their own merits. getSequenceNote checks the placed
   descriptors after the pass and surfaces any caveat.
------------------------- */

function getSequenceNote(sequence, question) {

    if (!question.notes) {
        return "";
    }

    const tags =
        new Set(
            sequence
                .map(item => item.descriptor)
                .filter(Boolean)
                .map(descriptor => descriptor.tag)
                .filter(Boolean)
        );


    for (const note of question.notes) {

        if (tags.has(note.tag)) {
            return note.message;
        }

    }

    return "";

}


function showSuccess(elapsed, note) {

    clearResult();

    successTime.textContent =
        "T+ " + elapsed.toFixed(2) + "s";

    successNoteEl.textContent =
        note || "";

    successOverlay.classList.add(
        "active"
    );

}

successDismiss.addEventListener(
    "click",
    event => {

        // Consume this click so it cannot immediately
        // trigger the newly revealed start screen.
        event.stopPropagation();

        successOverlay.classList.remove(
            "active"
        );

        resetTimer();

        switchOverlay(
            successOverlay,
            startOverlay
        );

    }
);

/* -------------------------
   Drop area placeholder
------------------------- */

function updateDropArea() {

    const hasBlocks =
        dropArea.querySelector(
            ".block"
        );

    const placeholder =
        dropArea.querySelector(
            ".drop-placeholder"
        );


    if (placeholder) {

        placeholder.style.display =
            hasBlocks ? "none" : "block";

    }

}


/* -------------------------
   Initial state
------------------------- */

loadQuestion("easy");

resetTimer();

updateDropArea();