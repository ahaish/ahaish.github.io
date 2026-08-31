(function () {
  "use strict";

  const STORAGE_KEY = "ahaish.checklists.v1";
  const form = document.querySelector("[data-list-form]");

  if (!form) {
    return;
  }

  const fields = document.querySelector("[data-item-fields]");
  const summary = document.querySelector("[data-form-summary]");
  const live = document.querySelector("[data-live-message]");
  let itemNumber = 0;

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function validInteger(value, minimum) {
    return /^\d+$/.test(String(value).trim()) && Number(value) >= minimum;
  }

  function isList(list) {
    return list && typeof list.id === "string" && typeof list.name === "string"
      && typeof list.memo === "string" && Array.isArray(list.items) && list.items.length > 0
      && list.items.every((item) => item && typeof item.id === "string" && typeof item.name === "string"
        && validInteger(item.requiredCount, 0) && validInteger(item.checkedCount, 0)
        && (!Object.hasOwn(item, "memo") || typeof item.memo === "string"));
  }

  function readLists() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) && value.every(isList) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function validate(value) {
    const errors = [];
    if (!value.name.trim()) {
      errors.push({ key: "name", message: "チェックリスト名を入力してください。" });
    }
    value.items.forEach((item, index) => {
      if (!item.name.trim()) {
        errors.push({ key: `item-name-${index}`, message: "アイテム名を入力してください。" });
      }
      if (!validInteger(item.requiredCount, 0)) {
        errors.push({ key: `item-count-${index}`, message: "必要な個数は0以上の整数で入力してください。" });
      }
    });
    return errors;
  }

  function addItem() {
    const index = itemNumber;
    itemNumber += 1;
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const content = document.createElement("div");
    const topRow = document.createElement("div");
    const actions = document.createElement("div");
    row.className = "item-row";
    content.className = "item-row-content";
    topRow.className = "item-row-top";
    actions.className = "item-edit-actions";
    legend.textContent = `アイテム ${itemNumber}`;
    row.append(legend);

    [
      ["アイテム名（必須）", "itemName", "item-name", "text", "", topRow],
      ["必要な個数（必須）", "itemCount", "item-count", "number", "1", topRow],
      ["アイテムメモ（任意）", "itemMemo", "item-memo", "textarea", "", content],
    ].forEach(([labelText, dataName, key, type, value, parent]) => {
      const label = document.createElement("label");
      const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      const error = document.createElement("p");
      label.append(labelText);
      if (type !== "textarea") {
        input.type = type;
      }
      input.value = value;
      input.dataset[dataName] = "";
      input.dataset.errorKey = `${key}-${index}`;
      input.required = type !== "textarea";
      if (type === "number") {
        input.min = "0";
        input.step = "1";
        input.inputMode = "numeric";
      } else if (type === "textarea") {
        input.rows = 3;
      } else {
        input.autocomplete = "off";
      }
      error.className = "field-error";
      error.hidden = true;
      label.append(input, error);
      parent.append(label);
    });
    content.prepend(topRow);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button danger item-remove";
    remove.textContent = "削除";
    remove.dataset.removeItem = "";
    remove.addEventListener("click", () => {
      if (fields.children.length <= 1) {
        return;
      }
      row.remove();
      updateRemoveButtons();
    });
    actions.append(remove);
    row.append(content, actions);
    fields.append(row);
    updateRemoveButtons();
    return row.querySelector("[data-item-name]");
  }

  function updateRemoveButtons() {
    const disabled = fields.children.length <= 1;
    fields.querySelectorAll("[data-remove-item]").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function clearErrors() {
    form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
    form.querySelectorAll(".field-error").forEach((error) => {
      error.hidden = true;
      error.textContent = "";
    });
    summary.hidden = true;
  }

  function showErrors(errors) {
    clearErrors();
    if (!errors.length) {
      return;
    }
    summary.hidden = false;
    errors.forEach((error) => {
      const input = form.querySelector(`[data-error-key="${error.key}"]`);
      if (!input) {
        return;
      }
      input.setAttribute("aria-invalid", "true");
      const note = input.closest("label").querySelector(".field-error");
      note.textContent = error.message;
      note.hidden = false;
    });
    form.querySelector("[aria-invalid]").focus();
  }

  addItem();
  document.querySelector("[data-add-item]").addEventListener("click", () => addItem().focus());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = {
      name: form.elements.name.value,
      memo: form.elements.memo.value,
      items: [...fields.querySelectorAll("fieldset")].map((row) => ({
        name: row.querySelector("[data-item-name]").value,
        memo: row.querySelector("[data-item-memo]").value,
        requiredCount: row.querySelector("[data-item-count]").value,
      })),
    };
    const errors = validate(value);
    showErrors(errors);
    if (errors.length) {
      return;
    }

    const list = {
      id: createId("list"),
      name: value.name.trim(),
      memo: value.memo,
      items: value.items.map((item) => ({
        id: createId("item"),
        name: item.name.trim(),
        memo: item.memo,
        requiredCount: Number(item.requiredCount),
        checkedCount: 0,
      })),
    };
    const lists = readLists();
    lists.push(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    live.textContent = "チェックリストを登録しました。";
    window.location.assign(`../items/?id=${encodeURIComponent(list.id)}`);
  });

  window.ChecklistAdd = { validInteger, validate };
}());
