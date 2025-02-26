'use client';

import { useAtom } from 'jotai';

import { useEffectOnce } from '~/core/hooks/use-effect-once';
import { useEditable } from '~/core/state/editable-store';

import { shouldStartInEditModeAtom } from '~/atoms';

export const AutomaticModeToggle = () => {
  const [shouldStartInEditMode, setShouldStartInEditMode] = useAtom(shouldStartInEditModeAtom);
  const { editable, setEditable } = useEditable();

  useEffectOnce(() => {
    setTimeout(() => {
      if (!editable && shouldStartInEditMode) {
        setEditable(true);
      }

      setShouldStartInEditMode(false);
    }, 100);
  });

  return null;
};
