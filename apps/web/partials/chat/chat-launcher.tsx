'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import dynamic from 'next/dynamic';

import { BOTTOM_INSET_OFFSET_CLASS } from '~/core/app-bottom-inset';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { useHideAssistant } from './assistant-visibility';

const loadChatWidget = () => import('~/partials/chat/chat-widget').then(m => ({ default: m.ChatWidget }));

// The widget carries the AI SDK and the whole chat panel, so it is fetched when the assistant is
// first wanted rather than on every page load.
const ChatWidget = dynamic(loadChatWidget, { ssr: false });

/**
 * What stays mounted for the assistant: its floating button and its Cmd/Ctrl+K shortcut. Everything
 * else loads on the first press, or when something else asks for the panel (the onboarding hand-off,
 * a URL ingestion) by setting `isChatOpenAtom` or `assistantSeedAtom`.
 */
export function ChatLauncher() {
  const isOpen = useAtomValue(isChatOpenAtom);
  const seed = useAtomValue(assistantSeedAtom);
  const hideAssistant = useHideAssistant();
  const [trigger, setTrigger] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const wanted = isOpen || seed !== null || trigger !== null;
  if (wanted && !loaded) setLoaded(true);

  const listening = !loaded;
  React.useEffect(() => {
    if (!listening) return;

    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'k') return;
      // Don't hijack the shortcut mid-IME composition.
      if (event.isComposing || hideAssistant) return;
      event.preventDefault();
      setTrigger('keyboard_shortcut');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, hideAssistant]);

  if (loaded) return <ChatWidget openOnMount={trigger} />;
  if (hideAssistant) return null;

  const preload = () => void loadChatWidget();

  return (
    <button
      type="button"
      onClick={() => setTrigger('fab')}
      onPointerEnter={preload}
      onFocus={preload}
      aria-label="Open assistant"
      className={`fixed right-4 ${BOTTOM_INSET_OFFSET_CLASS} ${Z_LAYER_CLASS.assistantLauncher} flex size-10 items-center justify-center rounded-full border border-grey-02 bg-white text-text shadow-lg transition-colors hover:border-text`}
    >
      <AssistantSparkle size={20} />
    </button>
  );
}
