/**
 * Security helper to block DevTools and source inspection keyboard shortcuts.
 *
 * Targets:
 * - F12 (Standard DevTools toggle across Chromium, WebView2, Edge, Chrome)
 * - Ctrl+Shift+I / Cmd+Option+I / Cmd+Shift+I (DevTools Elements/Inspector)
 * - Ctrl+Shift+J / Cmd+Option+J / Cmd+Shift+J (DevTools Console)
 * - Ctrl+Shift+C / Cmd+Shift+C / Cmd+Option+C (DevTools Element Picker)
 * - Ctrl+Shift+K (Web Console)
 * - Ctrl+Shift+E (DevTools Network)
 * - Ctrl+U / Cmd+U (View Page Source)
 * - Shift+F10 (Context menu shortcut)
 */

export interface KeyShortcutEvent {
  key?: string;
  code?: string;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function isDevToolsShortcut(e: KeyShortcutEvent): boolean {
  const key = e.key || '';
  const code = e.code || '';
  const keyCode = e.keyCode || 0;
  const isCtrlOrMeta = !!(e.ctrlKey || e.metaKey);
  const isShift = !!e.shiftKey;
  const isAlt = !!e.altKey;

  // 1. F12 key
  if (key === 'F12' || code === 'F12' || keyCode === 123) {
    return true;
  }

  // 2. Ctrl+Shift+I / J / C / K / E or Cmd+Option+I / J / C
  const inspectedKeys = ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k', 'E', 'e'];
  const inspectedCodes = ['KeyI', 'KeyJ', 'KeyC', 'KeyK', 'KeyE'];
  if (isCtrlOrMeta && (isShift || isAlt) && (inspectedKeys.includes(key) || inspectedCodes.includes(code))) {
    return true;
  }

  // 3. Ctrl+U / Cmd+U (View Source)
  if (isCtrlOrMeta && (key === 'U' || key === 'u' || code === 'KeyU' || keyCode === 85)) {
    return true;
  }

  // 4. Shift + F10 (Context menu accelerator)
  if (isShift && (key === 'F10' || code === 'F10' || keyCode === 121)) {
    return true;
  }

  return false;
}

export function setupDevToolsBlocker(): void {
  // Capture-phase listener on window to intercept hotkeys before browser default actions
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (isDevToolsShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      }
    },
    { capture: true }
  );
}
