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
        && validInteger(item.requiredCount, 1) && validInteger(item.checkedCount, 0));
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
      if (!validInteger(item.requiredCount, 1)) {
        errors.push({ key: `item-count-${index}`, message: "必要な個数は1以上の整数で入力してください。" });
      }
    });
    return errors;
  }

  function addItem() {
    const index = itemNumber;
    itemNumber += 1;
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    row.className = "item-row";
    legend.textContent = `アイテム ${itemNumber}`;
    row.append(legend);

    [
      ["アイテム名（必須）", "itemName", "item-name", "text", ""],
      ["必要な個数（必須）", "itemCount", "item-count", "number", "1"],
    ].forEach(([labelText, dataName, key, type, value]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const error = document.createElement("p");
      label.append(labelText);
      input.type = type;
      input.value = value;
      input.dataset[dataName] = "";
      input.dataset.errorKey = `${key}-${index}`;
      input.required = true;
      if (type === "number") {
        input.min = "1";
        input.step = "1";
        input.inputMode = "numeric";
      } else {
        input.autocomplete = "off";
      }
      error.className = "field-error";
      error.hidden = true;
      label.append(input, error);
      row.append(label);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button danger item-remove";
    remove.textContent = "削除";
    remove.dataset.removeItem = "";
    const removeNote = document.createElement("p");
    removeNote.className = "item-remove-note";
    removeNote.id = `item-remove-note-${index}`;
    removeNote.dataset.removeNote = "";
    removeNote.hidden = true;
    removeNote.textContent = "最後の1件は削除できません。";
    remove.addEventListener("click", () => {
      if (fields.children.length <= 1) {
        return;
      }
      row.remove();
      updateRemoveButtons();
    });
    row.append(remove, removeNote);
    fields.append(row);
    updateRemoveButtons();
    return row.querySelector("[data-item-name]");
  }

  function updateRemoveButtons() {
    const disabled = fields.children.length <= 1;
    fields.querySelectorAll("[data-remove-item]").forEach((button) => {
      const note = button.parentElement.querySelector("[data-remove-note]");
      button.disabled = disabled;
      note.hidden = !disabled;
      if (disabled) {
        button.setAttribute("aria-describedby", note.id);
      } else {
        button.removeAttribute("aria-describedby");
      }
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
