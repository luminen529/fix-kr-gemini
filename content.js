(function () {
  "use strict";

  const EDITOR_SELECTOR = '.ql-editor[contenteditable="true"]';
  const SEND_BUTTON_SELECTORS = [
    'button[aria-label="메시지 보내기"]',
    'button[aria-label="Send message"]'
  ];

  let composingEditor = null;
  let pendingEditor = null;
  let sendTimer = null;
  let lastClickedText = "";
  let lastClickedAt = 0;

  function getEditor(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest(EDITOR_SELECTOR);
  }

  function isPlainEnter(event) {
    // Windows IMEs may expose key="Process" while code still identifies Enter.
    // 229 alone is not enough: it is also used for ordinary composition keys.
    return (
      (event.key === "Enter" ||
        event.code === "Enter" ||
        event.code === "NumpadEnter") &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    );
  }

  function isImeEnter(event, editor) {
    return Boolean(
      event.isComposing ||
      event.keyCode === 229 ||
      composingEditor === editor
    );
  }

  function getEditorText(editor) {
    return (editor.textContent || "")
      .replace(/\u200B/g, "")
      .replace(/\u00A0/g, " ")
      .trim();
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function findSendButton() {
    for (const selector of SEND_BUTTON_SELECTORS) {
      const buttons = document.querySelectorAll(selector);

      for (const button of buttons) {
        if (
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          isVisible(button)
        ) {
          return button;
        }
      }
    }

    return null;
  }

  function clearPending(editor) {
    if (!editor || pendingEditor === editor) {
      pendingEditor = null;
      clearTimeout(sendTimer);
      sendTimer = null;
    }
  }

  function sendAfterComposition(editor) {
    if (!editor || pendingEditor !== editor || composingEditor === editor) {
      return;
    }

    if (!editor.isConnected || !getEditorText(editor)) {
      clearPending(editor);
      return;
    }

    const button = findSendButton();
    if (!button) {
      clearPending(editor);
      return;
    }

    const text = getEditorText(editor);
    const now = Date.now();
    if (text === lastClickedText && now - lastClickedAt < 500) {
      clearPending(editor);
      return;
    }

    lastClickedText = text;
    lastClickedAt = now;
    clearPending(editor);
    button.click();
  }

  function scheduleSend(editor) {
    if (!editor || pendingEditor !== editor || sendTimer !== null) {
      return;
    }

    sendTimer = setTimeout(function () {
      sendTimer = null;
      sendAfterComposition(editor);
    }, 0);
  }

  window.addEventListener(
    "compositionstart",
    function (event) {
      const editor = getEditor(event.target);
      if (editor) {
        composingEditor = editor;
      }
    },
    true
  );

  window.addEventListener(
    "compositionend",
    function (event) {
      const editor = getEditor(event.target);
      if (!editor) {
        return;
      }

      if (composingEditor === editor) {
        composingEditor = null;
      }

      // Empty composition data means that the IME composition was cancelled.
      if (pendingEditor === editor && event.data === "") {
        clearPending(editor);
        return;
      }

      scheduleSend(editor);
    },
    true
  );

  window.addEventListener(
    "keydown",
    function (event) {
      const editor = getEditor(event.target);
      if (!editor) {
        return;
      }

      if (event.key === "Escape" || event.code === "Escape") {
        clearPending(editor);
        return;
      }

      // Shift+Enter and all non-IME Enter events keep Gemini's native behavior.
      if (event.repeat || !isPlainEnter(event) || !isImeEnter(event, editor)) {
        return;
      }

      // Do not cancel this keydown: the IME needs its default action to commit
      // the final syllable. The send is deferred until compositionend.
      pendingEditor = editor;

      // Keep the IME default action, but don't let Gemini also send this Enter.
      event.stopImmediatePropagation();

      // Some browser/IME combinations dispatch compositionend before keydown.
      // isComposing/keyCode=229 can still identify that IME keydown.
      if (composingEditor !== editor) {
        scheduleSend(editor);
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    function (event) {
      const editor = getEditor(event.target);
      if (
        editor &&
        pendingEditor === editor &&
        isPlainEnter(event) &&
        !event.isComposing &&
        composingEditor !== editor
      ) {
        scheduleSend(editor);
      }
    },
    true
  );
})();
