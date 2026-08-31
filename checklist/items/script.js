(function () {
  "use strict";

  const KEY = "ahaish.checklists.v1";

  function integer(value, minimum) {
    return /^\d+$/.test(String(value).trim()) && Number(value) >= minimum;
  }

  function validItem(item) {
    return item && typeof item.id === "string" && typeof item.name === "string"
      && integer(item.requiredCount, 1) && integer(item.checkedCount, 0);
  }

  function validList(list) {
    return list && typeof list.id === "string" && typeof list.name === "string"
      && typeof list.memo === "string" && Array.isArray(list.items) && list.items.length > 0
      && list.items.every(validItem);
  }

  function read(storage) {
    try {
      const raw = storage.getItem(KEY);
      const value = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(value) && value.every(validList) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function save(lists, storage) {
    storage.setItem(KEY, JSON.stringify(lists));
  }

  function progress(list) {
    return {
      completed: list.items.filter((item) => item.checkedCount >= item.requiredCount).length,
      total: list.items.length,
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
      if (!integer(item.requiredCount, 1)) {
        errors.push({ key: `count-${index}`, message: "必要な個数は1以上の整数で入力してください。" });
      }
    });
    return errors;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function updateList(list, value) {
    return {
      ...list,
      name: value.name.trim(),
      memo: value.memo,
      items: value.items.map((item, index) => {
        const old = list.items[index];
        return old ? {
          ...old,
          name: item.name.trim(),
          requiredCount: Number(item.requiredCount),
        } : {
          id: makeId("item"),
          name: item.name.trim(),
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
    list.items.forEach((item) => {
      const done = item.checkedCount >= item.requiredCount;
      const card = document.createElement("article");
      const status = document.createElement("div");
      const heading = document.createElement("h3");
      const checkLabel = document.createElement("label");
      const checkbox = document.createElement("input");
      card.className = "item-card";
      status.className = "item-status";
      checkLabel.className = "item-check";
      checkbox.type = "checkbox";
      checkbox.checked = done;
      checkbox.setAttribute("aria-label", `${item.name}の一括チェック`);
      checkbox.addEventListener("change", () => {
        updateItem(item.id, toggle);
        message.textContent = "";
        render();
      });
      checkLabel.append(checkbox, text("span", item.name));
      heading.append(checkLabel);
      card.append(heading);

      if (item.requiredCount >= 2) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        const error = text("p", "", "item-error");
        label.className = "count-field";
        const labelText = text("span", `${item.name}のチェック済み個数`, "visually-hidden");
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
            message.textContent = result.message;
            return;
          }
          input.removeAttribute("aria-invalid");
          error.textContent = "";
          updateItem(item.id, (candidate) => ({ ...candidate, checkedCount: result.checkedCount }));
          message.textContent = "";
          render();
        });
        label.append(labelText, input, document.createTextNode(`/${item.requiredCount}個`));
        status.append(label, error);
      }

      if (item.requiredCount >= 2) {
        card.append(status);
      }
      const li = document.createElement("li");
      li.append(card);
      ul.append(li);
    });
    content.replaceChildren(ul);
  }

  function itemFields(container, index, item) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "item-row";
    fieldset.append(text("legend", `アイテム ${index + 1}`));
    [
      ["アイテム名（必須）", "name", item.name],
      ["必要な個数（必須）", "count", item.requiredCount],
    ].forEach(([labelText, kind, value]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      label.append(labelText);
      input.type = kind === "count" ? "number" : "text";
      input.required = true;
      input.value = value;
      input.dataset[kind] = "";
      input.dataset.key = `${kind}-${index}`;
      if (kind === "count") {
        input.min = "1";
        input.step = "1";
        input.inputMode = "numeric";
      }
      label.append(input, text("p", "", "field-error"));
      fieldset.append(label);
    });
    container.append(fieldset);
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
    nameLabel.append(name, text("p", "", "field-error"));
    memoLabel.className = "field";
    memoLabel.append("メモ（任意）");
    memoInput.rows = 4;
    memoInput.value = list.memo;
    memoLabel.append(memoInput);
    basic.append(nameLabel, memoLabel);
    section.append(text("h3", "アイテム"));
    items.className = "item-fields";
    list.items.forEach((item, index) => itemFields(items, index, item));
    add.type = "button";
    add.className = "button secondary";
    add.textContent = "アイテムを追加";
    add.addEventListener("click", () => itemFields(items, items.children.length, { name: "", requiredCount: 1 }).focus());
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
          name: row.querySelector("[data-name]").value,
          requiredCount: row.querySelector("[data-count]").value,
        })),
      };
      const errors = validate(value);
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      form.querySelectorAll(".field-error").forEach((error) => {
        error.textContent = "";
      });
      if (errors.length) {
        summary.hidden = false;
        errors.forEach((error) => {
          const input = form.querySelector(`[data-key="${error.key}"]`);
          input.setAttribute("aria-invalid", "true");
          input.parentElement.querySelector(".field-error").textContent = error.message;
        });
        form.querySelector("[aria-invalid]").focus();
        return;
      }
      persist(lists.map((entry) => entry.id === id ? updateList(entry, value) : entry));
      message.textContent = "変更を保存しました。";
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

  mode.addEventListener("change", render);
  resetButton.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      persist(reset(lists, id));
      message.textContent = "チェックをリセットしました。";
      render();
    }
    resetButton.focus();
  });
  render();
}());
