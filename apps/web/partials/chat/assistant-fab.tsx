'use client';

import { motion } from 'framer-motion';

import { BOTTOM_INSET_OFFSET_CLASS } from '~/core/app-bottom-inset';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { useHideAssistant, useHideAssistantLauncher } from './assistant-visibility';

const FAB_CLASS = `fixed right-4 ${BOTTOM_INSET_OFFSET_CLASS} ${Z_LAYER_CLASS.assistantLauncher} flex size-10 items-center justify-center rounded-full border border-grey-02 bg-white text-text shadow-lg transition-colors hover:border-text`;

/**
 * The assistant's floating button, drawn by `ChatLauncher` until the widget loads and by `ChatWidget`
 * after, so both keep it off in the same places: full-screen routes, and entity pages that use a
 * template (GEO-3846). `animated` is the widget's, which fades it in and out with the panel.
 */
export function AssistantFab({
  onOpen,
  onPreload,
  animated = false,
}: {
  onOpen: () => void;
  onPreload?: () => void;
  animated?: boolean;
}) {
  const hideAssistant = useHideAssistant();
  const hideLauncher = useHideAssistantLauncher();
  if (hideAssistant || hideLauncher) return null;

  if (animated) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
        onClick={onOpen}
        aria-label="Open assistant"
        className={FAB_CLASS}
      >
        <AssistantSparkle size={20} />
      </motion.button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      aria-label="Open assistant"
      className={FAB_CLASS}
    >
      <AssistantSparkle size={20} />
    </button>
  );
}
