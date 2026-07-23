import { useEffect, useRef } from 'react';

type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Binds F-keys (and optional other keys). Ignores non-F keypresses while a
 * text field has focus so typing is never hijacked; F-keys always fire.
 * Ctrl+Delete (abandon) also fires while typing.
 */
export function useHotkeys(bindings: HotkeyMap) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const map = ref.current;
      const handler = map[e.key] ?? map[e.code];
      if (!handler) return;

      const isFKey = /^F([1-9]|1[0-2])$/i.test(e.key);
      const isAbandon = e.ctrlKey && e.key === 'Delete';
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        !!el?.isContentEditable;

      if (typing && !isFKey && !isAbandon) return;

      e.preventDefault();
      handler(e);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
