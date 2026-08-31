(function () {
  "use strict";

  const KEY = "ahaish.checklists.v1";

  function integer(value, minimum) {
    return /^\d+$/.test(String(value).trim()) && Number(value) >= minimum;
  }

  function normalizeItem(item) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string"
      || !integer(item.requiredCount, 0) || !integer(item.checkedCount, 0)
      || (Object.hasOwn(item, "memo") && typeof item.memo !== "string")) {
      return null;
    }
    return { ...item, memo: item.memo || "" };
  }

  function normalizeList(list) {
    if (!list || typeof list.id !== "string" || typeof list.name !== "string"
      || typeof list.memo !== "string" || !Array.isArray(list.items) || list.items.length === 0) {
      return null;
    }
    const items = list.items.map(normalizeItem);
    return items.every(Boolean) ? { ...list, items } : null;
  }

  function validList(list) {
    return Boolean(normalizeList(list));
  }

  function read(storage) {
    try {
      const raw = storage.getItem(KEY);
      const value = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(value)) {
        return [];
      }
      const lists = value.map(normalizeList);
      return lists.every(Boolean) ? lists : [];
    } catch (_) {
      return [];
    }
  }

  function save(lists, storage) {
    storage.setItem(KEY, JSON.stringify(lists));
  }

  function progress(list) {
    const visible = list.items.filter((item) => item.requiredCount >= 1);
    return {
      completed: visible.filter((item) => item.checkedCount >= item.requiredCount).length,
      total: visible.length,
    };
  }

  function toggle(item) {
    return {
      ...item,
      checkedCount: item.checkedCount >= item.requiredCount ? 0 : item.requiredCount,
    };
  }

  function normalizeCheckedCount(value, previousCount) {
    if (!integer(value, 0)) {
      return {
        checkedCount: previousCount,
        message: "チェック済み個数は0以上の整数で入力してください。",
        ok: false,
      };
    }
    return {
      checkedCount: Number(value),
      message: "",
      ok: true,
    };
  }

  function reset(lists, id) {
    return lists.map((list) => list.id === id ? {
      ...list,
      items: list.items.map((item) => ({ ...item, checkedCount: 0 })),
    } : list);
  }

  function validate(value) {
    const errors = [];
    if (!value.name.trim()) {
      errors.push({ key: "name", message: "チェックリスト名を入力してください。" });
    }
    value.items.forEach((item, index) => {
      if (!item.name.trim()) {
        errors.push({ key: `name-${index}`, message: "アイテム名を入力してください。" });
      }
      if (!integer(item.requiredCount, 0)) {
        errors.push({ key: `count-${index}`, message: "必要な個数は0以上の整数で入力してください。" });
      }
    });
    return errors;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function updateList(list, value, createItem = makeId) {
    const oldItems = new Map(list.items.map((item) => [item.id, item]));
    return {
      ...list,
      name: value.name.trim(),
      memo: value.memo,
      items: value.items.map((item) => {
        const old = item.id && oldItems.get(item.id);
        return old ? {
          ...old,
          name: item.name.trim(),
          memo: item.memo,
          requiredCount: Number(item.requiredCount),
        } : {
          id: createItem("item"),
          name: item.name.trim(),
          memo: item.memo,
          requiredCount: Number(item.requiredCount),
          checkedCount: 0,
        };
      }),
    };
  }

  window.ChecklistCore = {
    KEY,
    integer,
    isList: validList,
    normalizeItem,
    normalizeList,
    normalizeCheckedCount,
    progress,
    read,
    reset,
    toggle,
    updateList,
    validate,
  };

  const app = document.querySelector("[data-app]");
  if (!app) {
    return;
  }

  const id = new URLSearchParams(location.search).get("id");
  const title = document.querySelector("[data-list-title]");
  const memo = document.querySelector("[data-list-memo]");
  const mode = document.querySelector("[data-mode]");
  const content = document.querySelector("[data-content]");
  const message = document.querySelector("[data-live-message]");
  const dialog = document.querySelector("[data-reset-dialog]");
  const resetButton = document.querySelector("[data-reset]");
  let lists = read(localStorage);
  let list = id && lists.find((entry) => entry.id === id);

  function announce(value) {
    message.textContent = value;
    message.hidden = !value;
  }

  function text(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) {
      element.className = className;
    }
    return element;
  }

  function refresh() {
    lists = read(localStorage);
    list = lists.find((entry) => entry.id === id);
    return Boolean(list);
  }

  function persist(next) {
    lists = next;
    save(lists, localStorage);
    list = lists.find((entry) => entry.id === id);
  }

  function missing() {
    title.textContent = "チェックリストが見つかりません";
    app.querySelector(".controls").hidden = true;
    resetButton.hidden = true;
    content.replaceChildren(text("p", "指定されたチェックリストは表示できませんでした。"));
  }

  function renderHeader() {
    title.textContent = list.name;
    memo.textContent = list.memo;
    memo.hidden = !list.memo;
  }

  function updateItem(itemId, updater) {
    persist(lists.map((entry) => entry.id === id ? {
      ...entry,
      items: entry.items.map((item) => item.id === itemId ? updater(item) : item),
    } : entry));
  }

  function renderCheck() {
    const ul = document.createElement("ul");
    ul.className = "item-list";
    list.items.filter((item) => item.requiredCount >= 1).forEach((item) => {
      const done = item.checkedCount >= item.requiredCount;
      const card = document.createElement("article");
      const details = document.createElement("div");
      const heading = document.createElement("h3");
      const checkLabel = document.createElement("label");
      const checkbox = document.createElement("input");
      card.className = "item-card";
      details.className = "item-details";
      checkLabel.className = "item-check";
      checkbox.type = "checkbox";
      checkbox.checked = done;
      checkbox.setAttribute("aria-label", `${item.name}の一括チェック`);
      checkbox.addEventListener("change", () => {
        updateItem(item.id, toggle);
        announce("");
        render();
      });
      checkLabel.append(checkbox, text("span", item.name));
      heading.append(checkLabel);
      details.append(heading);
      if (item.memo) {
        details.append(text("p", item.memo, "item-memo"));
      }
      card.append(details);
      if (item.requiredCount >= 2) {
        const status = document.createElement("div");
        const label = document.createElement("label");
        const input = document.createElement("input");
        const error = text("p", "", "item-error");
        status.className = "item-status";
        label.className = "count-field";
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.inputMode = "numeric";
        input.value = item.checkedCount;
        input.setAttribute("aria-label", `${item.name}のチェック済み個数`);
        input.addEventListener("change", () => {
          const result = normalizeCheckedCount(input.value, item.checkedCount);
          if (!result.ok) {
            input.value = result.checkedCount;
            input.setAttribute("aria-invalid", "true");
            error.textContent = result.message;
            announce(result.message);
            return;
          }
          input.removeAttribute("aria-invalid");
          error.textContent = "";
          updateItem(item.id, (candidate) => ({ ...candidate, checkedCount: result.checkedCount }));
          announce("");
          render();
        });
        label.append(text("span", `${item.name}のチェック済み個数`, "visually-hidden"), input, document.createTextNode(`/${item.requiredCount}個`));
        status.append(label, error);
        card.append(status);
      }
      const li = document.createElement("li");
      li.append(card);
      ul.append(li);
    });
    content.replaceChildren(ul);
  }

  function refreshEditRows(items) {
    [...items.children].forEach((row, index) => {
      const up = row.querySelector("[data-move-up]");
      const down = row.querySelector("[data-move-down]");
      const remove = row.querySelector("[data-remove-item]");
      row.querySelector("legend").textContent = `アイテム ${index + 1}`;
      row.querySelectorAll("[data-key]").forEach((input) => {
        const kind = input.matches("[data-name]") ? "name" : input.matches("[data-count]") ? "count" : "memo";
        input.dataset.key = `${kind}-${index}`;
      });
      up.disabled = index === 0;
      down.disabled = index === items.children.length - 1;
      remove.disabled = items.children.length <= 1;
    });
  }

  function itemFields(container, index, item) {
    const fieldset = document.createElement("fieldset");
    const content = document.createElement("div");
    const topRow = document.createElement("div");
    const actions = document.createElement("div");
    fieldset.className = "item-row";
    fieldset.dataset.itemId = item.id || "";
    fieldset.append(text("legend", `アイテム ${index + 1}`));
    content.className = "item-row-content";
    topRow.className = "item-row-top";
    actions.className = "item-edit-actions";
    [
      ["アイテム名（必須）", "name", item.name],
      ["必要な個数（必須）", "count", item.requiredCount],
      ["アイテムメモ（任意）", "memo", item.memo || ""],
    ].forEach(([labelText, kind, value]) => {
      const label = document.createElement("label");
      const input = kind === "memo" ? document.createElement("textarea") : document.createElement("input");
      label.append(labelText);
      if (kind === "count") {
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.inputMode = "numeric";
        input.required = true;
      } else if (kind === "name") {
        input.type = "text";
        input.required = true;
      } else {
        input.rows = 3;
      }
      input.value = value;
      input.dataset[kind] = "";
      input.dataset.key = `${kind}-${index}`;
      const error = text("p", "", "field-error");
      error.id = `item-field-error-${Date.now().toString(36)}-${index}-${kind}`;
      error.hidden = true;
      input.setAttribute("aria-describedby", error.id);
      label.append(input, error);
      (kind === "memo" ? content : topRow).append(label);
    });
    content.prepend(topRow);
    [["上へ", "moveUp"], ["下へ", "moveDown"], ["削除", "removeItem"]].forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action === "removeItem" ? "button danger" : "button secondary";
      button.textContent = label;
      button.dataset[action] = "";
      actions.append(button);
    });
    fieldset.append(content, actions);
    container.append(fieldset);
    refreshEditRows(container);
    return fieldset.querySelector("[data-name]");
  }

  function renderEdit() {
    const form = document.createElement("form");
    const summary = text("p", "入力内容を確認してください。", "form-summary");
    const basic = document.createElement("section");
    const nameLabel = document.createElement("label");
    const name = document.createElement("input");
    const memoLabel = document.createElement("label");
    const memoInput = document.createElement("textarea");
    const section = document.createElement("section");
    const items = document.createElement("div");
    const add = document.createElement("button");
    const submit = document.createElement("button");
    form.className = "edit-form";
    form.noValidate = true;
    summary.hidden = true;
    summary.setAttribute("role", "alert");
    basic.append(text("h3", "基本情報"));
    nameLabel.className = "field";
    nameLabel.append("チェックリスト名（必須）");
    name.type = "text";
    name.required = true;
    name.value = list.name;
    name.dataset.name = "";
    name.dataset.key = "name";
    const nameError = text("p", "", "field-error");
    nameError.id = "list-name-error";
    nameError.hidden = true;
    name.setAttribute("aria-describedby", nameError.id);
    nameLabel.append(name, nameError);
    memoLabel.className = "field";
    memoLabel.append("メモ（任意）");
    memoInput.rows = 4;
    memoInput.value = list.memo;
    memoInput.dataset.memo = "";
    basic.append(nameLabel, memoLabel);
    section.append(text("h3", "アイテム"));
    items.className = "item-fields";
    list.items.forEach((item, index) => itemFields(items, index, item));
    items.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      const row = button.closest("fieldset");
      let focusTarget = null;
      if (button.matches("[data-move-up]") && row.previousElementSibling) {
        items.insertBefore(row, row.previousElementSibling);
      } else if (button.matches("[data-move-down]") && row.nextElementSibling) {
        items.insertBefore(row.nextElementSibling, row);
      } else if (button.matches("[data-remove-item]") && items.children.length > 1) {
        const nextRow = row.nextElementSibling || row.previousElementSibling;
        focusTarget = nextRow.querySelector("[data-name]");
        row.remove();
      }
      refreshEditRows(items);
      if (focusTarget) {
        focusTarget.focus();
      }
    });
    add.type = "button";
    add.className = "button secondary";
    add.textContent = "アイテムを追加";
    add.addEventListener("click", () => itemFields(items, items.children.length, { name: "", memo: "", requiredCount: 1 }).focus());
    section.append(items, add);
    submit.type = "submit";
    submit.className = "button primary";
    submit.textContent = "変更を保存";
    form.append(summary, basic, section, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = {
        name: name.value,
        memo: memoInput.value,
        items: [...items.children].map((row) => ({
          id: row.dataset.itemId,
          name: row.querySelector("[data-name]").value,
          memo: row.querySelector("[data-memo]").value,
          requiredCount: row.querySelector("[data-count]").value,
        })),
      };
      const errors = validate(value);
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      form.querySelectorAll(".field-error").forEach((error) => {
        error.textContent = "";
        error.hidden = true;
      });
      if (errors.length) {
        summary.hidden = false;
        errors.forEach((error) => {
          const input = form.querySelector(`[data-key="${error.key}"]`);
          input.setAttribute("aria-invalid", "true");
          const note = input.parentElement.querySelector(".field-error");
          note.textContent = error.message;
          note.hidden = false;
        });
        form.querySelector("[aria-invalid]").focus();
        return;
      }
      persist(lists.map((entry) => entry.id === id ? updateList(entry, value) : entry));
      announce("変更を保存しました。");
      render();
    });
    content.replaceChildren(form);
  }

  function render() {
    if (!refresh()) {
      missing();
      return;
    }
    renderHeader();
    if (mode.value === "edit") {
      renderEdit();
    } else {
      renderCheck();
    }
  }

  if (!list) {
    missing();
    return;
  }

  mode.addEventListener("change", () => {
    announce("");
    render();
  });
  resetButton.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      persist(reset(lists, id));
      announce("チェックをリセットしました。");
      render();
    }
    resetButton.focus();
  });
  announce("");
  render();
}());
