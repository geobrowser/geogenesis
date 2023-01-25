import { useEffect } from 'react';

interface Shortcut {
  key: KeyboardEvent['key'];
  callback: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: any[]) {
  useEffect(() => {
    const shortcutMap = new Map(shortcuts.map((shortcut: Shortcut) => [shortcut.key, shortcut.callback]));

    const down = (e: KeyboardEvent) => {
      // MacOS
      if (e.metaKey && shortcutMap.has(e.key)) {
        console.log(e.key);
        shortcutMap.get(e.key)?.();
      }

      // Windows
      if (e.ctrlKey && shortcutMap.has(e.key)) {
        shortcutMap.get(e.key)?.();
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, deps);
}
