(function () {
  "use strict";

  const STORAGE_KEY = "ahaish.memory-order.v1";
  const MIN_SIZE = 2;
  const MAX_SIZE = 6;
  const STORAGE_VERSION = 1;

  function isSize(value) {
    return Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE;
  }

  function isScore(value) {
    return (
      value &&
      Number.isFinite(value.totalMs) &&
      value.totalMs >= 0 &&
      Number.isFinite(value.memorizationMs) &&
      value.memorizationMs >= 0 &&
      Number.isFinite(value.recallMs) &&
      value.recallMs >= 0 &&
      Number.isInteger(value.mistakes) &&
      value.mistakes >= 0 &&
      Number.isFinite(value.recordedAt) &&
      value.recordedAt >= 0
    );
  }

  function createDefaultData() {
    return {
      version: STORAGE_VERSION,
      unlockedMax: MIN_SIZE,
      lastCompletedSize: null,
      scores: {},
    };
  }

  function normalizeData(value) {
    const normalized = createDefaultData();

    if (
      !value ||
      value.version !== STORAGE_VERSION ||
      typeof value !== "object" ||
      !isSize(value.unlockedMax) ||
      (value.lastCompletedSize !== null &&
        (!isSize(value.lastCompletedSize) ||
          value.lastCompletedSize > value.unlockedMax)) ||
      !value.scores ||
      typeof value.scores !== "object" ||
      Array.isArray(value.scores)
    ) {
      return normalized;
    }

    for (const [sizeKey, entries] of Object.entries(value.scores)) {
      const size = Number(sizeKey);
      if (
        !isSize(size) ||
        size > value.unlockedMax ||
        !Array.isArray(entries) ||
        !entries.every(isScore)
      ) {
        return normalized;
      }

      normalized.scores[size] = rankScores(entries);
    }

    normalized.unlockedMax = value.unlockedMax;
    normalized.lastCompletedSize = value.lastCompletedSize;
    return normalized;
  }

  function rankScores(entries) {
    return entries
      .map((entry) => ({ ...entry }))
      .sort((left, right) => {
        if (left.totalMs !== right.totalMs) {
          return left.totalMs - right.totalMs;
        }

        return left.recordedAt - right.recordedAt;
      })
      .slice(0, 3);
  }

  function addScore(data, size, score) {
    const next = normalizeData(data);
    if (!isSize(size) || size > next.unlockedMax || !isScore(score)) {
      return next;
    }

    next.scores[size] = rankScores([...(next.scores[size] || []), score]);
    next.lastCompletedSize = size;

    if (score.mistakes === 0 && size < MAX_SIZE) {
      next.unlockedMax = Math.max(next.unlockedMax, size + 1);
    }

    return next;
  }

  function shuffleNumbers(size, random = Math.random) {
    if (!isSize(size)) {
      return [];
    }

    const numbers = Array.from({ length: size * size }, (_, index) => index + 1);

    for (let index = numbers.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [numbers[index], numbers[target]] = [numbers[target], numbers[index]];
    }

    return numbers;
  }

  function createBoard(size) {
    if (!isSize(size)) {
      return [];
    }

    return Array.from({ length: size * size }, (_, index) => ({
      id: index,
      row: Math.floor(index / size) + 1,
      column: (index % size) + 1,
    }));
  }

  function calculateScore(memorizationMs, recallMs, mistakes) {
    if (
      !Number.isFinite(memorizationMs) ||
      memorizationMs < 0 ||
      !Number.isFinite(recallMs) ||
      recallMs < 0 ||
      !Number.isInteger(mistakes) ||
      mistakes < 0
    ) {
      return null;
    }

    return memorizationMs + recallMs + mistakes * 1000;
  }

  function attemptNumber(nextNumber, selectedNumber, mistakes, finalNumber) {
    if (selectedNumber !== nextNumber) {
      return { correct: false, complete: false, mistakes: mistakes + 1, nextNumber };
    }

    return {
      correct: true,
      complete: selectedNumber === finalNumber,
      mistakes,
      nextNumber: nextNumber + 1,
    };
  }

  function formatSeconds(milliseconds) {
    return `${(milliseconds / 1000).toFixed(3)}秒`;
  }

  function readData(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalizeData(JSON.parse(raw)) : createDefaultData();
    } catch (_error) {
      return createDefaultData();
    }
  }

  function writeData(storage, data) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  const core = {
    addScore,
    attemptNumber,
    calculateScore,
    createBoard,
    createDefaultData,
    formatSeconds,
    isSize,
    normalizeData,
    readData,
    rankScores,
    shuffleNumbers,
    writeData,
  };

  if (typeof window !== "undefined") {
    window.MemoryOrderCore = core;
  }

  const app =
    typeof document !== "undefined"
      ? document.querySelector("[data-memory-order-app]")
      : null;
  if (!app) {
    return;
  }

  const elements = {
    board: document.querySelector("[data-game-board]"),
    memorize: document.querySelector("[data-memorize]"),
    recall: document.querySelector("[data-recall]"),
    resultMessage: document.querySelector("[data-result-message]"),
    saveMessage: document.querySelector("[data-save-message]"),
    scoreBody: document.querySelector("[data-score-body]"),
    scoreCaption: document.querySelector("[data-score-caption]"),
    scoreHeading: document.querySelector("[data-score-heading]"),
    emptyScores: document.querySelector("[data-empty-scores]"),
    boardPanel: document.querySelector("[data-board-panel]"),
    select: document.querySelector("[data-grid-size]"),
    settingsPanel: document.querySelector("[data-settings-panel]"),
    status: document.querySelector("[data-game-status]"),
  };

  const state = {
    data: readData(getStorage()),
    memorizationStartedAt: 0,
    mode: "select",
    mistakes: 0,
    nextNumber: 1,
    numbers: [],
    recallStartedAt: 0,
    size: MIN_SIZE,
  };

  state.size = state.data.lastCompletedSize || MIN_SIZE;

  function clearMessage(element) {
    element.hidden = true;
    element.textContent = "";
  }

  function setMessage(element, message) {
    element.hidden = false;
    element.textContent = message;
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function populateSelect() {
    elements.select.textContent = "";

    for (let size = MIN_SIZE; size <= MAX_SIZE; size += 1) {
      const option = document.createElement("option");
      const unlocked = size <= state.data.unlockedMax;
      option.value = String(size);
      option.disabled = !unlocked;
      option.textContent = String(size);
      elements.select.append(option);
    }

    if (state.size > state.data.unlockedMax) {
      state.size = state.data.unlockedMax;
    }
    elements.select.value = String(state.size);
    elements.select.disabled = state.mode !== "select";
  }

  function renderScores() {
    const scores = state.data.scores[state.size] || [];
    const label = `N=${state.size} の上位スコア`;
    elements.scoreHeading.textContent = label;
    elements.scoreCaption.textContent = label;
    elements.scoreBody.textContent = "";
    elements.emptyScores.hidden = scores.length > 0;

    scores.forEach((score, index) => {
      const row = document.createElement("tr");
      const cells = [
        String(index + 1),
        formatSeconds(score.totalMs),
        formatSeconds(score.memorizationMs),
        formatSeconds(score.recallMs),
        `${score.mistakes}回（+${score.mistakes}秒）`,
      ];
      cells.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      elements.scoreBody.append(row);
    });
  }

  function cellLabel(index, number, revealed) {
    const row = Math.floor(index / state.size) + 1;
    const column = (index % state.size) + 1;
    if (state.mode === "memorize") {
      return `${row}行 ${column}列、数字を覚える盤面`;
    }
    if (revealed) {
      return `${number}、${row}行 ${column}列`;
    }
    return `${row}行 ${column}列、未表示`;
  }

  function renderBoard() {
    elements.board.textContent = "";
    elements.board.style.setProperty("--grid-size", String(state.size));
    elements.board.dataset.size = String(state.size);
    elements.board.setAttribute("aria-label", `N=${state.size} のゲーム盤`);

    const revealedLimit = state.mode === "recall" ? state.nextNumber - 1 : 0;
    state.numbers.forEach((number, index) => {
      const button = document.createElement("button");
      const revealed =
        state.mode === "memorize" ||
        (state.mode === "recall" && number <= revealedLimit);
      button.type = "button";
      button.className = "cell";
      button.dataset.cellIndex = String(index);
      button.disabled = state.mode !== "recall";
      if (state.mode === "recall" && revealed) {
        button.setAttribute("aria-disabled", "true");
      }
      button.textContent = revealed ? String(number) : "0";
      button.classList.toggle("is-revealed", revealed && state.mode === "recall");
      button.classList.toggle("is-hidden-number", !revealed);
      button.setAttribute("aria-label", cellLabel(index, number, revealed));
      button.addEventListener("click", () => selectCell(index));
      elements.board.append(button);
    });
  }

  function render() {
    populateSelect();
    renderScores();
    renderBoard();
    elements.settingsPanel.hidden = state.mode !== "select";
    elements.boardPanel.hidden = state.mode === "select";
    elements.memorize.hidden = state.mode !== "select";
    elements.recall.hidden = state.mode !== "memorize";
    elements.memorize.disabled = state.size > state.data.unlockedMax;
  }

  function startMemorization() {
    if (state.mode !== "select" || state.size > state.data.unlockedMax) {
      return;
    }

    clearMessage(elements.resultMessage);
    clearMessage(elements.saveMessage);
    state.mode = "memorize";
    state.numbers = shuffleNumbers(state.size);
    state.mistakes = 0;
    state.nextNumber = 1;
    state.memorizationStartedAt = Date.now();
    setStatus("数字と位置を覚えたら、想起を押してください。");
    render();
    elements.recall.focus();
  }

  function startRecall() {
    if (state.mode !== "memorize") {
      return;
    }

    state.mode = "recall";
    state.recallStartedAt = Date.now();
    setStatus("");
    render();
    const firstIndex = state.numbers.indexOf(1);
    const firstCell = elements.board.querySelector(`[data-cell-index="${firstIndex}"]`);
    if (firstCell) {
      firstCell.focus();
    }
  }

  function finishGame() {
    const finishedAt = Date.now();
    const memorizationMs = state.recallStartedAt - state.memorizationStartedAt;
    const recallMs = finishedAt - state.recallStartedAt;
    const score = {
      totalMs: calculateScore(memorizationMs, recallMs, state.mistakes),
      memorizationMs,
      recallMs,
      mistakes: state.mistakes,
      recordedAt: finishedAt,
    };
    const previousUnlocked = state.data.unlockedMax;
    state.data = addScore(state.data, state.size, score);
    const saved = writeData(getStorage(), state.data);
    const size = state.size;
    const unlocked = state.data.unlockedMax > previousUnlocked;
    state.mode = "select";
    setMessage(
      elements.resultMessage,
      `クリア。合計 ${formatSeconds(score.totalMs)}（暗記 ${formatSeconds(memorizationMs)}、想起 ${formatSeconds(recallMs)}、ミス ${state.mistakes}回）${unlocked ? ` N=${size + 1} を選べるようになりました。` : ""}`,
    );
    if (!saved) {
      setMessage(elements.saveMessage, "このブラウザには記録を保存できません。今回の結果はページを閉じると消えます。");
    }
    setStatus("Nを選んで、暗記を押してください。");
    render();
    elements.memorize.focus();
  }

  function selectCell(index) {
    if (state.mode !== "recall") {
      return;
    }

    const number = state.numbers[index];
    if (number < state.nextNumber) {
      return;
    }

    const result = attemptNumber(
      state.nextNumber,
      number,
      state.mistakes,
      state.size * state.size,
    );
    state.mistakes = result.mistakes;
    if (!result.correct) {
      setStatus(`違います。次は ${state.nextNumber} です。ミス ${state.mistakes} 回。`);
      return;
    }

    state.nextNumber = result.nextNumber;
    if (result.complete) {
      finishGame();
      return;
    }

    setStatus(`${number}。次は ${state.nextNumber} です。`);
    renderBoard();
    const selectedCell = elements.board.querySelector(`[data-cell-index="${index}"]`);
    if (selectedCell) {
      selectedCell.focus();
    }
  }

  elements.select.addEventListener("change", () => {
    const selected = Number(elements.select.value);
    if (isSize(selected) && selected <= state.data.unlockedMax) {
      state.size = selected;
      render();
    }
  });
  elements.memorize.addEventListener("click", startMemorization);
  elements.recall.addEventListener("click", startRecall);

  state.numbers = Array.from({ length: state.size * state.size }, () => 0);
  setStatus("Nを選んで、暗記を押してください。");
  render();
})();
