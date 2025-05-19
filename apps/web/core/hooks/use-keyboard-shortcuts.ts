import { useEffectOnce } from '~/core/hooks/use-effect-once';

interface Shortcut {
  key: KeyboardEvent['key'];
  callback: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutMap = new Map(shortcuts.map((shortcut: Shortcut) => [shortcut.key, shortcut.callback]));

  const down = (e: KeyboardEvent) => {
    // MacOS
    if (e.metaKey && shortcutMap.has(e.key)) {
      shortcutMap.get(e.key)?.();
    }

    // Windows
    if (e.ctrlKey && shortcutMap.has(e.key)) {
      shortcutMap.get(e.key)?.();
    }
  };

  useEffectOnce(() => {
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  });
}
