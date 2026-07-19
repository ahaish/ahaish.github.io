const app = document.querySelector("[data-inventory-app]");

if (app) {
  const STORAGE_KEY = "ahaish.inventory.v1";
  const MAX_HISTORY = 80;
  const MAX_QUANTITY = 999999999;

  const elements = {
    form: document.querySelector("[data-item-form]"),
    itemName: document.querySelector("[data-item-name]"),
    itemQuantity: document.querySelector("[data-item-quantity]"),
    itemUnit: document.querySelector("[data-item-unit]"),
    itemThreshold: document.querySelector("[data-item-threshold]"),
    itemTags: document.querySelector("[data-item-tags]"),
    formMessage: document.querySelector("[data-form-message]"),
    submitButton: document.querySelector("[data-submit-button]"),
    cancelEdit: document.querySelector("[data-cancel-edit]"),
    deleteEditing: document.querySelector("[data-delete-editing]"),
    entryPanel: document.querySelector("[data-entry-panel]"),
    search: document.querySelector("[data-search]"),
    tagFilter: document.querySelector("[data-tag-filter]"),
    lowOnly: document.querySelector("[data-low-only]"),
    clearFilters: document.querySelector("[data-clear-filters]"),
    resultCount: document.querySelector("[data-result-count]"),
    emptyState: document.querySelector("[data-empty-state]"),
    itemList: document.querySelector("[data-item-list]"),
    historyList: document.querySelector("[data-history-list]"),
    historyEmpty: document.querySelector("[data-history-empty]"),
    clearHistory: document.querySelector("[data-clear-history]"),
    exportJson: document.querySelector("[data-export-json]"),
    importJson: document.querySelector("[data-import-json]"),
    importJsonInput: document.querySelector("[data-import-json-input]"),
    ioMessage: document.querySelector("[data-io-message]"),
  };

  const numberFormatter = new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 4,
  });

  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const state = {
    items: [],
    history: [],
    editingId: null,
    filters: {
      query: "",
      tag: "all",
      lowOnly: false,
    },
  };

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  function sanitizeText(value, maxLength) {
    return String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function normalizeNumberText(value) {
    return String(value ?? "")
      .replace(/[０-９]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0xfee0),
      )
      .replace(/[．，]/g, ".")
      .trim();
  }

  function roundQuantity(value) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  function parseQuantity(value, label, options = {}) {
    const { allowZero = true } = options;
    const text = normalizeNumberText(value);
    const number = Number(text);

    if (text === "" || !Number.isFinite(number)) {
      throw new Error(`${label}は数値で入力してください。`);
    }

    if (number < 0 || (!allowZero && number <= 0)) {
      throw new Error(
        allowZero
          ? `${label}は0以上で入力してください。`
          : `${label}は0より大きい数値で入力してください。`,
      );
    }

    if (number > MAX_QUANTITY) {
      throw new Error(`${label}が大きすぎます。`);
    }

    return roundQuantity(number);
  }

  function parseOptionalQuantity(value, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return fallback;
    }

    return roundQuantity(Math.min(number, MAX_QUANTITY));
  }

  function parseTags(value) {
    const source = Array.isArray(value)
      ? value
      : String(value ?? "").split(/[|,、]/);
    const tags = [];
    const seen = new Set();

    source.forEach((item) => {
      const tag = sanitizeText(item, 28);
      const key = tag.toLocaleLowerCase("ja-JP");

      if (tag && !seen.has(key)) {
        tags.push(tag);
        seen.add(key);
      }
    });

    return tags.slice(0, 12);
  }

  function normalizeIsoDate(value) {
    const text = sanitizeText(value, 40);
    const date = new Date(text);

    if (!text || Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
  }

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function setMessage(element, message, type) {
    if (!element) {
      return;
    }

    if (!message) {
      element.hidden = true;
      element.textContent = "";
      element.classList.remove("is-error", "is-success");
      return;
    }

    element.hidden = false;
    element.textContent = message;
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function formatQuantity(value, unit) {
    const text = numberFormatter.format(value);
    return unit ? `${text} ${unit}` : text;
  }

  function isLowStock(item) {
    return item.quantity <= item.threshold;
  }

  function getAllTags() {
    const tags = new Set();

    state.items.forEach((item) => {
      item.tags.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort((a, b) => a.localeCompare(b, "ja-JP"));
  }

  function normalizeStoredItem(item, usedIds) {
    const name = sanitizeText(item.name, 80);

    if (!name) {
      return null;
    }

    let id = sanitizeText(item.id, 80);

    if (!id || usedIds.has(id)) {
      id = createId("item");
    }

    usedIds.add(id);

    return {
      id,
      name,
      quantity: parseOptionalQuantity(item.quantity, 0),
      unit: sanitizeText(item.unit, 20),
      threshold: parseOptionalQuantity(item.threshold, 0),
      tags: parseTags(item.tags),
      createdAt: normalizeIsoDate(item.createdAt),
      updatedAt: normalizeIsoDate(item.updatedAt),
    };
  }

  function normalizeStoredHistory(entry, usedIds) {
    const id = sanitizeText(entry.id, 80) || createId("history");

    if (usedIds.has(id)) {
      return null;
    }

    usedIds.add(id);

    return {
      id,
      type: sanitizeText(entry.type, 20),
      itemId: sanitizeText(entry.itemId, 80),
      itemName: sanitizeText(entry.itemName, 80),
      amount: Number.isFinite(Number(entry.amount)) ? Number(entry.amount) : null,
      before: Number.isFinite(Number(entry.before)) ? Number(entry.before) : null,
      after: Number.isFinite(Number(entry.after)) ? Number(entry.after) : null,
      unit: sanitizeText(entry.unit, 20),
      at: normalizeIsoDate(entry.at),
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      const itemIds = new Set();
      const historyIds = new Set();

      state.items = Array.isArray(parsed.items)
        ? parsed.items
            .map((item) => normalizeStoredItem(item, itemIds))
            .filter(Boolean)
        : [];
      state.history = Array.isArray(parsed.history)
        ? parsed.history
            .map((entry) => normalizeStoredHistory(entry, historyIds))
            .filter(Boolean)
            .slice(0, MAX_HISTORY)
        : [];
    } catch (error) {
      setMessage(
        elements.ioMessage,
        "保存済みデータを読み込めませんでした。新しいデータとして開始します。",
        "error",
      );
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: state.items,
          history: state.history,
        }),
      );
      return true;
    } catch (error) {
      setMessage(
        elements.ioMessage,
        "ブラウザの保存領域に書き込めませんでした。",
        "error",
      );
      return false;
    }
  }

  function addHistory(type, item, detail = {}) {
    state.history.unshift({
      id: createId("history"),
      type,
      itemId: item.id || "",
      itemName: item.name || "",
      amount: Number.isFinite(detail.amount) ? detail.amount : null,
      before: Number.isFinite(detail.before) ? detail.before : null,
      after: Number.isFinite(detail.after) ? detail.after : null,
      unit: item.unit || "",
      at: new Date().toISOString(),
    });

    state.history = state.history.slice(0, MAX_HISTORY);
  }

  function getItemFromForm() {
    const name = sanitizeText(elements.itemName.value, 80);
    const unit = sanitizeText(elements.itemUnit.value, 20);
    const quantity = parseQuantity(elements.itemQuantity.value, "数量");
    const threshold = parseQuantity(elements.itemThreshold.value, "閾値");
    const tags = parseTags(elements.itemTags.value);

    if (!name) {
      throw new Error("備品名を入力してください。");
    }

    return {
      name,
      quantity,
      unit,
      threshold,
      tags,
    };
  }

  function resetForm(options = {}) {
    if (elements.form) {
      elements.form.reset();
    }

    if (elements.itemQuantity) {
      elements.itemQuantity.value = "0";
    }

    if (elements.itemThreshold) {
      elements.itemThreshold.value = "0";
    }

    state.editingId = null;
    setText(elements.submitButton, "登録");

    if (elements.cancelEdit) {
      elements.cancelEdit.hidden = true;
    }

    if (elements.deleteEditing) {
      elements.deleteEditing.hidden = true;
    }

    if (!options.keepMessage) {
      setMessage(elements.formMessage, "", "");
    }
  }

  function fillFormForEdit(item) {
    state.editingId = item.id;
    if (elements.entryPanel) {
      elements.entryPanel.open = true;
    }
    elements.itemName.value = item.name;
    elements.itemQuantity.value = String(item.quantity);
    elements.itemUnit.value = item.unit;
    elements.itemThreshold.value = String(item.threshold);
    elements.itemTags.value = item.tags.join(", ");
    setText(elements.submitButton, "更新");

    if (elements.cancelEdit) {
      elements.cancelEdit.hidden = false;
    }

    if (elements.deleteEditing) {
      elements.deleteEditing.hidden = false;
    }

    elements.itemName.focus();
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    setMessage(elements.formMessage, "", "");

    try {
      const formItem = getItemFromForm();
      const now = new Date().toISOString();

      if (state.editingId) {
        const item = state.items.find((candidate) => candidate.id === state.editingId);

        if (!item) {
          throw new Error("編集中の備品が見つかりません。");
        }

        Object.assign(item, formItem, {
          updatedAt: now,
        });
        addHistory("edit", item);
        resetForm({
          keepMessage: true,
        });
        setMessage(elements.formMessage, "備品を更新しました。", "success");
      } else {
        const item = {
          id: createId("item"),
          ...formItem,
          createdAt: now,
          updatedAt: now,
        };
        state.items.push(item);
        addHistory("create", item, {
          amount: item.quantity,
          before: 0,
          after: item.quantity,
        });
        resetForm({
          keepMessage: true,
        });
        setMessage(elements.formMessage, "備品を登録しました。", "success");
      }

      saveState();
      render();
    } catch (error) {
      setMessage(elements.formMessage, error.message, "error");
    }
  }

  function deleteItem(item) {
    const message = `${item.name}を削除します。よろしいですか？`;

    if (!window.confirm(message)) {
      return;
    }

    state.items = state.items.filter((candidate) => candidate.id !== item.id);
    addHistory("delete", item, {
      amount: item.quantity,
      before: item.quantity,
      after: 0,
    });

    if (state.editingId === item.id) {
      resetForm();
    }

    saveState();
    render();
  }

  function updateQuantity(item, amount, action) {
    const before = item.quantity;
    let after = before;

    if (action === "add") {
      after = before + amount;
    } else {
      if (amount > before) {
        throw new Error("使用量が現在の数量を超えています。");
      }

      after = before - amount;
    }

    item.quantity = roundQuantity(after);
    item.updatedAt = new Date().toISOString();
    addHistory(action, item, {
      amount,
      before,
      after: item.quantity,
    });
  }

  function clearElement(element) {
    if (element) {
      element.replaceChildren();
    }
  }

  function createNode(tagName, className, text) {
    const node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function createActionButton(text, className, dataName, value) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.dataset[dataName] = value;
    return button;
  }

  function renderTags(container, tags) {
    clearElement(container);

    if (!tags.length) {
      container.append(createNode("p", "no-tags", "タグなし"));
      return;
    }

    tags.forEach((tag) => {
      container.append(createNode("span", "tag-pill", tag));
    });
  }

  function renderItem(item) {
    const card = createNode("article", "item-card");
    card.dataset.itemId = item.id;
    card.setAttribute("role", "listitem");

    if (isLowStock(item)) {
      card.classList.add("is-low");
    }

    const header = createNode("div", "item-card-header");
    const titleGroup = createNode("div", "item-title-group");
    titleGroup.append(createNode("h3", "", item.name));
    titleGroup.append(
      createNode(
        "p",
        "item-meta",
        `閾値 ${formatQuantity(item.threshold, item.unit)}`,
      ),
    );

    const actions = createNode("div", "item-actions");
    actions.append(
      createActionButton("編集", "icon-text-button", "editItem", item.id),
    );
    header.append(titleGroup, actions);

    const tags = createNode("div", "tag-list");
    renderTags(tags, item.tags);

    const quantityArea = createNode("div", "quantity-area");
    const status = createNode("div", "status-line");
    const quantityValue = createNode("div", "quantity-value");
    quantityValue.append(
      createNode("strong", "", numberFormatter.format(item.quantity)),
      createNode("span", "", item.unit || "単位なし"),
    );
    const statusPill = createNode(
      "span",
      isLowStock(item) ? "status-pill is-low" : "status-pill",
      isLowStock(item) ? "閾値以下" : "在庫あり",
    );
    status.append(quantityValue, statusPill);

    const stockForm = createNode("form", "stock-form");
    stockForm.dataset.stockForm = item.id;

    const adjustLabel = createNode("label", "adjust-field");
    adjustLabel.append(
      createNode("span", "visually-hidden", `${item.name}の変更量`),
    );

    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "any";
    amountInput.value = "1";
    amountInput.inputMode = "decimal";
    amountInput.dataset.adjustAmount = "";
    amountInput.setAttribute("aria-label", `${item.name}の変更量`);
    adjustLabel.append(amountInput);

    const buttonGroup = createNode("div", "stock-buttons");
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.name = "stock-action";
    addButton.value = "add";
    addButton.className = "stock-button add";
    addButton.textContent = "+ 補充";

    const useButton = document.createElement("button");
    useButton.type = "submit";
    useButton.name = "stock-action";
    useButton.value = "use";
    useButton.className = "stock-button use";
    useButton.textContent = "- 使用";
    buttonGroup.append(addButton, useButton);

    const cardMessage = createNode("p", "card-message");
    cardMessage.hidden = true;
    cardMessage.dataset.cardMessage = "";
    cardMessage.setAttribute("role", "alert");
    stockForm.append(adjustLabel, buttonGroup, cardMessage);
    quantityArea.append(status, stockForm);

    card.append(header, tags, quantityArea);
    return card;
  }

  function updateTagFilterOptions(tags) {
    if (!elements.tagFilter) {
      return;
    }

    const currentValue = state.filters.tag;
    clearElement(elements.tagFilter);

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "すべて";
    elements.tagFilter.append(allOption);

    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      elements.tagFilter.append(option);
    });

    if (currentValue !== "all" && tags.includes(currentValue)) {
      elements.tagFilter.value = currentValue;
    } else {
      state.filters.tag = "all";
      elements.tagFilter.value = "all";
    }
  }

  function getFilteredItems() {
    const query = state.filters.query.toLocaleLowerCase("ja-JP");

    return state.items
      .filter((item) => {
        if (state.filters.lowOnly && !isLowStock(item)) {
          return false;
        }

        if (state.filters.tag !== "all" && !item.tags.includes(state.filters.tag)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const target = [item.name, item.unit, ...item.tags]
          .join(" ")
          .toLocaleLowerCase("ja-JP");
        return target.includes(query);
      })
      .sort((a, b) => {
        const lowDiff = Number(isLowStock(b)) - Number(isLowStock(a));

        if (lowDiff !== 0) {
          return lowDiff;
        }

        return a.name.localeCompare(b.name, "ja-JP");
      });
  }

  function renderItems() {
    const filteredItems = getFilteredItems();
    clearElement(elements.itemList);

    filteredItems.forEach((item) => {
      elements.itemList.append(renderItem(item));
    });

    setText(elements.resultCount, `${filteredItems.length}件を表示中`);

    if (elements.emptyState) {
      const hasNoItems = state.items.length === 0;
      elements.emptyState.hidden = filteredItems.length > 0;
      elements.emptyState.textContent = hasNoItems
        ? "登録されている備品はまだありません。"
        : "条件に合う備品がありません。";
    }
  }

  function formatHistory(entry) {
    const quantityText =
      entry.amount === null ? "" : formatQuantity(entry.amount, entry.unit);
    const transitionText =
      entry.before === null || entry.after === null
        ? ""
        : `${formatQuantity(entry.before, entry.unit)} -> ${formatQuantity(
            entry.after,
            entry.unit,
          )}`;

    if (entry.type === "create") {
      return {
        title: `登録: ${entry.itemName}`,
        detail: transitionText,
      };
    }

    if (entry.type === "delete") {
      return {
        title: `削除: ${entry.itemName}`,
        detail: transitionText,
      };
    }

    if (entry.type === "add") {
      return {
        title: `補充: ${entry.itemName} +${quantityText}`,
        detail: transitionText,
      };
    }

    if (entry.type === "use") {
      return {
        title: `使用: ${entry.itemName} -${quantityText}`,
        detail: transitionText,
      };
    }

    if (entry.type === "edit") {
      return {
        title: `編集: ${entry.itemName}`,
        detail: "登録内容を更新",
      };
    }

    return {
      title: entry.itemName || "操作",
      detail: "",
    };
  }

  function renderHistory() {
    clearElement(elements.historyList);

    if (elements.historyEmpty) {
      elements.historyEmpty.hidden = state.history.length > 0;
    }

    if (elements.clearHistory) {
      elements.clearHistory.disabled = state.history.length === 0;
    }

    state.history.forEach((entry) => {
      const item = createNode("li", "");
      const text = formatHistory(entry);
      const time = new Date(entry.at);
      item.append(createNode("strong", "", text.title));
      item.append(
        createNode(
          "span",
          "",
          `${dateFormatter.format(time)}${text.detail ? ` / ${text.detail}` : ""}`,
        ),
      );
      elements.historyList.append(item);
    });
  }

  function render() {
    const tags = getAllTags();
    updateTagFilterOptions(tags);
    renderItems();
    renderHistory();
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id);
  }

  function handleItemListClick(event) {
    const editButton = event.target.closest("[data-edit-item]");

    if (editButton) {
      const item = findItem(editButton.dataset.editItem);

      if (item) {
        fillFormForEdit(item);
      }

      return;
    }
  }

  function handleStockSubmit(event) {
    const form = event.target;

    if (!form.matches("[data-stock-form]")) {
      return;
    }

    event.preventDefault();
    const item = findItem(form.dataset.stockForm);
    const amountInput = form.querySelector("[data-adjust-amount]");
    const cardMessage = form.querySelector("[data-card-message]");
    const action = event.submitter ? event.submitter.value : "add";

    if (!item || !amountInput) {
      return;
    }

    try {
      const amount = parseQuantity(amountInput.value, "変更量", {
        allowZero: false,
      });
      updateQuantity(item, amount, action);
      amountInput.value = "1";
      setMessage(cardMessage, "", "");
      saveState();
      render();
    } catch (error) {
      setMessage(cardMessage, error.message, "error");
    }
  }

  function clearFilters() {
    state.filters.query = "";
    state.filters.tag = "all";
    state.filters.lowOnly = false;

    if (elements.search) {
      elements.search.value = "";
    }

    if (elements.tagFilter) {
      elements.tagFilter.value = "all";
    }

    if (elements.lowOnly) {
      elements.lowOnly.checked = false;
    }

    render();
  }

  function getDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function downloadFile(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: state.items,
      history: state.history,
    };

    downloadFile(
      `inventory-backup-${getDateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
    setMessage(elements.ioMessage, "JSONを書き出しました。", "success");
  }

  function validateJsonPayload(payload) {
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("JSONの形式が正しくありません。");
    }

    const itemIds = new Set();
    const historyIds = new Set();
    const items = payload.items
      .map((item) => normalizeStoredItem(item, itemIds))
      .filter(Boolean);
    const history = Array.isArray(payload.history)
      ? payload.history
          .map((entry) => normalizeStoredHistory(entry, historyIds))
          .filter(Boolean)
          .slice(0, MAX_HISTORY)
      : [];

    return {
      items,
      history,
    };
  }

  function importJsonFile(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = validateJsonPayload(JSON.parse(reader.result));

        if (
          !window.confirm(
            "現在のデータをJSONの内容で置き換えます。よろしいですか？",
          )
        ) {
          return;
        }

        state.items = payload.items;
        state.history = payload.history;
        resetForm();
        clearFilters();
        saveState();
        render();
        setMessage(elements.ioMessage, "JSONを復元しました。", "success");
      } catch (error) {
        setMessage(elements.ioMessage, error.message, "error");
      } finally {
        elements.importJsonInput.value = "";
      }
    });
    reader.addEventListener("error", () => {
      setMessage(elements.ioMessage, "JSONを読み込めませんでした。", "error");
      elements.importJsonInput.value = "";
    });
    reader.readAsText(file);
  }

  if (elements.form) {
    elements.form.addEventListener("submit", handleFormSubmit);
  }

  if (elements.cancelEdit) {
    elements.cancelEdit.addEventListener("click", resetForm);
  }

  if (elements.deleteEditing) {
    elements.deleteEditing.addEventListener("click", () => {
      if (!state.editingId) {
        return;
      }

      const item = findItem(state.editingId);

      if (item) {
        deleteItem(item);
      }
    });
  }

  if (elements.itemList) {
    elements.itemList.addEventListener("click", handleItemListClick);
    elements.itemList.addEventListener("submit", handleStockSubmit);
  }

  if (elements.search) {
    elements.search.addEventListener("input", () => {
      state.filters.query = elements.search.value.trim();
      render();
    });
  }

  if (elements.tagFilter) {
    elements.tagFilter.addEventListener("change", () => {
      state.filters.tag = elements.tagFilter.value;
      render();
    });
  }

  if (elements.lowOnly) {
    elements.lowOnly.addEventListener("change", () => {
      state.filters.lowOnly = elements.lowOnly.checked;
      render();
    });
  }

  if (elements.clearFilters) {
    elements.clearFilters.addEventListener("click", clearFilters);
  }

  if (elements.clearHistory) {
    elements.clearHistory.addEventListener("click", () => {
      if (!state.history.length) {
        return;
      }

      if (window.confirm("操作履歴を消します。よろしいですか？")) {
        state.history = [];
        saveState();
        render();
      }
    });
  }

  if (elements.exportJson) {
    elements.exportJson.addEventListener("click", exportJson);
  }

  if (elements.importJson && elements.importJsonInput) {
    elements.importJson.addEventListener("click", () =>
      elements.importJsonInput.click(),
    );
    elements.importJsonInput.addEventListener("change", () =>
      importJsonFile(elements.importJsonInput.files[0]),
    );
  }

  loadState();
  render();
}
