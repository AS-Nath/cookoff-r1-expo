const questionSection = document.querySelector(".question");
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

const successOverlay = document.querySelector("#success-overlay");
const successTime = document.querySelector("#success-time");
const successDismiss = document.querySelector("#success-dismiss");

const jumpFlash = document.querySelector("#jump-flash");

let draggedBlock = null;


/* -------------------------
   Questions

   A flat "put these in order"
   check can't represent a
   branch — so questions that
   need an if/else now carry
   requiresIndent: true, and
   each block gets an indent
   level (0 or 1) the visitor
   sets themselves with the
   ‹ › controls once it's
   placed. correctSequence
   checks text AND indent.

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
        blocks: [
            "Read N",
            "if N % 2 == 0:",
            "print(\"Even\")",
            "else:",
            "print(\"Odd\")",
            "print(\"Maybe\")"
        ],
        correctSequence: [
            { text: "Read N", indent: 0 },
            { text: "if N % 2 == 0:", indent: 0 },
            { text: "print(\"Even\")", indent: 1 },
            { text: "else:", indent: 0 },
            { text: "print(\"Odd\")", indent: 1 }
        ]
    },

    intermediate: {
        description: "A signal from the past gives you N, then N numbers. Loop through them to stabilize the total. Some fragments may not be needed.",
        hint: "Use the ‹ › arrows on a fragment to nest it inside the loop.",
        requiresIndent: true,
        blocks: [
            "Read N (the count of numbers)",
            "sum = 0",
            "for i in range(N):",
            "read a number, add it to sum",
            "Print sum",
            "Print N"
        ],
        correctSequence: [
            { text: "Read N (the count of numbers)", indent: 0 },
            { text: "sum = 0", indent: 0 },
            { text: "for i in range(N):", indent: 0 },
            { text: "read a number, add it to sum", indent: 1 },
            { text: "Print sum", indent: 0 }
        ]
    }

};

let currentCorrectSequence = QUESTIONS.easy.correctSequence;


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

    block.dataset.indent = String(level);

    block.classList.toggle("indent-1", level === 1);
    block.classList.toggle("indent-0", level === 0);

    const outdentBtn = block.querySelector(".indent-btn.outdent");
    const indentBtn = block.querySelector(".indent-btn.indent");

    if (outdentBtn) outdentBtn.disabled = level === 0;
    if (indentBtn) indentBtn.disabled = level === 1;

}


function createBlock(text, requiresIndent) {

    const block = document.createElement("div");

    block.className = "block";
    block.draggable = true;
    block.dataset.text = text;
    block.dataset.indent = "0";

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
        outdentBtn.setAttribute("aria-label", "Outdent this line");
        outdentBtn.title = "Outdent this line";

        const indentBtn = document.createElement("button");
        indentBtn.type = "button";
        indentBtn.className = "indent-btn indent";
        indentBtn.textContent = "›";
        indentBtn.draggable = false;
        indentBtn.setAttribute("aria-label", "Indent this line");
        indentBtn.title = "Indent this line";

        outdentBtn.addEventListener("mousedown", event => event.stopPropagation());
        indentBtn.addEventListener("mousedown", event => event.stopPropagation());

        outdentBtn.addEventListener("click", event => {
            event.stopPropagation();
            setBlockIndent(block, Math.max(0, parseInt(block.dataset.indent, 10) - 1));
        });

        indentBtn.addEventListener("click", event => {
            event.stopPropagation();
            setBlockIndent(block, Math.min(1, parseInt(block.dataset.indent, 10) + 1));
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

    descriptionEl.textContent = question.description;
    hintEl.textContent = question.hint || "";

    // Clear anything left over from a previous round —
    // both the pool and, just in case, the playground.
    blockPool.innerHTML = "";
    dropArea.querySelectorAll(".block").forEach(block => block.remove());

    shuffle(question.blocks).forEach(text => {
        blockPool.appendChild(createBlock(text, question.requiresIndent));
    });

    currentCorrectSequence = question.correctSequence;

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

    toOverlay.classList.add("active");

    function handleTransitionEnd(event) {

        if (event.target !== toOverlay || event.propertyName !== "opacity") return;

        toOverlay.removeEventListener("transitionend", handleTransitionEnd);

        fromOverlay.classList.remove("active");

        if (afterSwitch) afterSwitch();

    }

    toOverlay.addEventListener("transitionend", handleTransitionEnd);

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

    if (!startOverlay.classList.contains("active")) return;

    playDifficultyIntro();

    switchOverlay(startOverlay, difficultyOverlay);

}

startOverlay.addEventListener("click", beginChallenge);

window.addEventListener("keydown", () => {
    beginChallenge();
});


/* -------------------------
   Difficulty select
------------------------- */

difficultyEasyBtn.addEventListener("click", () => chooseDifficulty("easy"));
difficultyIntermediateBtn.addEventListener("click", () => chooseDifficulty("intermediate"));

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

    if (timerStart !== null) return;

    timerStart = performance.now();

    timerEl.classList.add("running");

    timerInterval = setInterval(updateTimerDisplay, 30);

}

function updateTimerDisplay() {

    if (timerStart === null) return;

    const elapsed = (performance.now() - timerStart) / 1000;

    timerEl.textContent = "T+ " + elapsed.toFixed(2) + "s";

}

function stopTimer() {

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    if (timerStart === null) return 0;

    const elapsed = (performance.now() - timerStart) / 1000;

    timerStart = null;

    return elapsed;

}

function resetTimer() {

    stopTimer();

    timerEl.classList.remove("running");
    timerEl.textContent = "T+ 00.00s";

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

    if (!draggedBlock) return;

    const afterElement = getDragAfterElement(dropArea, event.clientY);

    if (afterElement == null) {
        dropArea.appendChild(draggedBlock);
    } else {
        dropArea.insertBefore(draggedBlock, afterElement);
    }

});


dropArea.addEventListener("dragleave", event => {

    if (event.target === dropArea) {
        dropArea.classList.remove("drag-over");
    }

});


dropArea.addEventListener("drop", event => {

    event.preventDefault();

    dropArea.classList.remove("drag-over");

    if (!draggedBlock) return;

    draggedBlock.classList.add("placed");

    updateDropArea();

});


function getDragAfterElement(container, y) {

    const draggableElements = [
        ...container.querySelectorAll(".block:not(.dragging)")
    ];

    return draggableElements.reduce(
        (closest, child) => {

            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            }

            return closest;

        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
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
    blockPool.classList.add("pool-over");
});


blockPool.addEventListener("dragleave", event => {

    if (event.target === blockPool) {
        blockPool.classList.remove("pool-over");
    }

});


blockPool.addEventListener("drop", event => {

    event.preventDefault();

    blockPool.classList.remove("pool-over");

    if (!draggedBlock) return;

    draggedBlock.classList.remove("placed");
    setBlockIndent(draggedBlock, 0);

    blockPool.appendChild(draggedBlock);

    updateDropArea();

});


/* -------------------------
   Evaluate
------------------------- */

evaluateButton.addEventListener("click", () => {

    const sequence = [
        ...dropArea.querySelectorAll(".block")
    ].map(block => ({
        text: block.dataset.text,
        indent: parseInt(block.dataset.indent, 10)
    }));

    const isCorrect =
        sequence.length === currentCorrectSequence.length &&
        sequence.every((block, index) =>
            block.text === currentCorrectSequence[index].text &&
            block.indent === currentCorrectSequence[index].indent
        );

    if (isCorrect) {

        const elapsed = stopTimer();

        showSuccess(elapsed);

    } else {

        showResult("Not stable yet. Check the order — and nesting — of your fragments.");

        dropArea.classList.remove("shake");

        // restart the animation even on back-to-back misses
        void dropArea.offsetWidth;

        dropArea.classList.add("shake");

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

    resultEl.textContent = message;
    resultEl.classList.add("visible", "failure");
    resultEl.classList.remove("success");

}


function clearResult() {

    resultEl.classList.remove("visible", "success", "failure");
    resultEl.textContent = "";

}


/* -------------------------
   Success reveal
------------------------- */

function showSuccess(elapsed) {

    successTime.textContent = "T+ " + elapsed.toFixed(2) + "s";

    successOverlay.classList.add("active");

}


successDismiss.addEventListener("click", () => {

    // success (still fully opaque) -> start (fades in on
    // top) -> only once start is fully opaque do we drop
    // success and quietly reset the board behind it.
    switchOverlay(successOverlay, startOverlay, resetChallenge);

});


/* -------------------------
   Reset — brings the page
   back to a clean state for
   the next Expo visitor
------------------------- */

function resetChallenge() {

    document.querySelectorAll(".block.placed").forEach(block => {
        block.classList.remove("placed");
        setBlockIndent(block, 0);
        blockPool.appendChild(block);
    });

    clearResult();

    resetTimer();

    updateDropArea();

}


/* -------------------------
   Playground placeholder
------------------------- */

function updateDropArea() {

    const placeholder = dropArea.querySelector(".drop-placeholder");
    const hasBlocks = dropArea.querySelectorAll(".block").length > 0;

    if (placeholder) {
        placeholder.style.display = hasBlocks ? "none" : "block";
    }

}