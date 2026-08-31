(function () {
  "use strict";

  const STORAGE_KEY = "ahaish.checklists.v1";

  function validInteger(value, minimum) {
    return /^\d+$/.test(String(value).trim()) && Number(value) >= minimum;
  }

  function normalizeItem(value) {
    return value && typeof value.id === "string" && typeof value.name === "string"
      && validInteger(value.requiredCount, 0) && validInteger(value.checkedCount, 0)
      && (!Object.hasOwn(value, "memo") || typeof value.memo === "string")
      ? { ...value, memo: value.memo || "" }
      : null;
  }

  function normalizeList(value) {
    return value && typeof value.id === "string" && typeof value.name === "string"
      && typeof value.memo === "string" && Array.isArray(value.items) && value.items.length > 0
      && value.items.map(normalizeItem).every(Boolean)
      ? { ...value, items: value.items.map(normalizeItem) }
      : null;
  }

  function isList(value) {
    return Boolean(normalizeList(value));
  }

  function readLists(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const value = raw === null ? [] : JSON.parse(raw);
      const lists = Array.isArray(value) ? value.map(normalizeList) : [];
      return lists.every(Boolean) ? lists : [];
    } catch (_) {
      return [];
    }
  }

  function progress(list) {
    return {
      completed: list.items.filter((item) => item.requiredCount >= 1 && item.checkedCount >= item.requiredCount).length,
      total: list.items.filter((item) => item.requiredCount >= 1).length,
    };
  }

  function removeList(lists, id) {
    return lists.filter((list) => list.id !== id);
  }

  function exportJson(lists) {
    return JSON.stringify(lists, null, 2);
  }

  function parseImport(text) {
    try {
      const value = JSON.parse(text);
      if (!Array.isArray(value)) {
        return { ok: false, message: "JSONファイルの形式が正しくありません。" };
      }
      const lists = value.map(normalizeList);
      return lists.every(Boolean)
        ? { ok: true, lists }
        : { ok: false, message: "JSONファイルの形式が正しくありません。" };
    } catch (_) {
      return { ok: false, message: "JSONファイルを読み込めませんでした。" };
    }
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addImportedLists(existing, imported, makeId = createId) {
    const usedIds = new Set();
    existing.forEach((list) => {
      usedIds.add(list.id);
      list.items.forEach((item) => usedIds.add(item.id));
    });

    function uniqueId(prefix, originalId) {
      if (!usedIds.has(originalId)) {
        usedIds.add(originalId);
        return originalId;
      }
      let nextId = makeId(prefix);
      while (usedIds.has(nextId)) {
        nextId = makeId(prefix);
      }
      usedIds.add(nextId);
      return nextId;
    }

    const additions = imported.map((list) => ({
      ...list,
      id: uniqueId("list", list.id),
      items: list.items.map((item) => ({
        ...item,
        id: uniqueId("item", item.id),
      })),
    }));

    return existing.concat(additions);
  }

  window.ChecklistApp = {
    STORAGE_KEY,
    addImportedLists,
    exportJson,
    isList,
    normalizeItem,
    normalizeList,
    parseImport,
    progress,
    readLists,
    removeList,
  };

  const cards = document.querySelector("[data-list-cards]");
  const empty = document.querySelector("[data-empty-state]");
  const message = document.querySelector("[data-live-message]");
  const exportButton = document.querySelector("[data-export]");
  const importFile = document.querySelector("[data-import-file]");
  const dialog = document.querySelector("[data-confirm-dialog]");

  if (!cards || !empty || !message || !exportButton || !importFile || !dialog) {
    return;
  }

  const title = dialog.querySelector("[data-confirm-title]");
  const description = dialog.querySelector("[data-confirm-description]");
  const confirmButton = dialog.querySelector("[data-confirm-button]");
  let pendingAction = null;
  let trigger = null;

  function save(lists) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  }

  function announce(value) {
    message.textContent = value;
    message.hidden = !value;
  }

  function text(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) {
      node.className = className;
    }
    return node;
  }

  function render() {
    const lists = readLists(localStorage);
    cards.replaceChildren();
    empty.hidden = lists.length !== 0;

    lists.forEach((list) => {
      const card = document.createElement("li");
      const info = document.createElement("div");
      const summary = document.createElement("div");
      const actions = document.createElement("div");
      const value = progress(list);
      card.className = "list-card";
      info.className = "list-info";
      summary.className = "list-summary";
      actions.className = "card-actions";
      summary.append(text("h3", list.name), text("p", `${value.completed}/${value.total}`, "list-progress"));
      info.append(summary);
      if (list.memo) {
        info.append(text("p", list.memo, "list-memo"));
      }

      const open = document.createElement("a");
      open.className = "button primary";
      open.href = `./items/?id=${encodeURIComponent(list.id)}`;
      open.textContent = "開く";
      const remove = document.createElement("button");
      remove.className = "button danger";
      remove.type = "button";
      remove.textContent = "削除";
      remove.addEventListener("click", () => openDialog({ type: "delete", list }, remove));
      actions.append(open, remove);
      card.append(info, actions);
      cards.append(card);
    });
  }

  function openDialog(action, actionTrigger) {
    pendingAction = action;
    trigger = actionTrigger;
    if (action.type === "delete") {
      title.textContent = `「${action.list.name}」を削除しますか？`;
      description.textContent = "この操作は元に戻せません。";
      confirmButton.textContent = "削除する";
    } else {
      title.textContent = `${action.lists.length}件のチェックリストを追加しますか？`;
      description.textContent = "既存のチェックリストは保持したまま追加します。";
      confirmButton.textContent = "追加する";
    }
    dialog.showModal();
  }

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm" && pendingAction) {
      if (pendingAction.type === "delete") {
        save(removeList(readLists(localStorage), pendingAction.list.id));
        announce("チェックリストを削除しました。");
      } else {
        save(addImportedLists(readLists(localStorage), pendingAction.lists));
        announce(`${pendingAction.lists.length}件のチェックリストを追加しました。`);
      }
      render();
    }
    pendingAction = null;
    importFile.value = "";
    if (trigger) {
      trigger.focus();
    }
    trigger = null;
  });

  exportButton.addEventListener("click", () => {
    const blob = new Blob([exportJson(readLists(localStorage))], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "checklists.json";
    link.click();
    URL.revokeObjectURL(url);
    announce("JSONファイルを出力しました。");
  });

  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = parseImport(String(reader.result));
      if (!result.ok) {
        announce(result.message);
        importFile.value = "";
        return;
      }
      openDialog({ type: "import", lists: result.lists }, importFile);
    });
    reader.addEventListener("error", () => {
      announce("JSONファイルを読み込めませんでした。");
      importFile.value = "";
    });
    reader.readAsText(file, "UTF-8");
  });

  announce("");
  render();
}());
