'use client';

import type { JSONContent } from '@tiptap/core';

import * as React from 'react';

import { useAtomValue, useSetAtom } from 'jotai';

import { useEditorStore } from '~/core/state/editor/use-editor';

import {
  PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY,
  buildPersonalProfileBioStarterDocJson,
} from '~/partials/entity-page/personal-profile-bio-starter';

import { editorContentVersionAtom, personalProfileBioStarterTriggerAtom } from '~/atoms';

type StarterPayload = {
  kind: 'bio';
  displayName: string;
  targetSpaceId: string;
  targetEntityId: string;
};

/**
 * After navigating from “+ Add bio”, prepends seeded overview blocks at the **first** position
 * (directly under the Overview tab content).
 */
export function PersonalProfileBioStarterMerge({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { upsertEditorState, editorJson } = useEditorStore();
  const bump = useSetAtom(editorContentVersionAtom);
  const bioStarterTrigger = useAtomValue(personalProfileBioStarterTriggerAtom);
  const editorJsonRef = React.useRef(editorJson);
  editorJsonRef.current = editorJson;

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem(PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY);
    if (!raw) return;
    let payload: StarterPayload;
    try {
      payload = JSON.parse(raw) as StarterPayload;
    } catch {
      sessionStorage.removeItem(PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY);
      return;
    }
    if (payload.kind !== 'bio' || payload.targetSpaceId !== spaceId || payload.targetEntityId !== entityId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    // Defer so `editorJson` reflects hydrated block relations (prepend stays before existing overview blocks).
    const rafId = requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const raw2 = sessionStorage.getItem(PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY);
        if (!raw2) return;
        let p2: StarterPayload;
        try {
          p2 = JSON.parse(raw2) as StarterPayload;
        } catch {
          sessionStorage.removeItem(PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY);
          return;
        }
        if (p2.kind !== 'bio' || p2.targetSpaceId !== spaceId || p2.targetEntityId !== entityId) return;

        sessionStorage.removeItem(PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY);

        const starter = buildPersonalProfileBioStarterDocJson(p2.displayName, spaceId);
        const current = editorJsonRef.current;
        const merged: JSONContent = {
          type: 'doc',
          content: [...(starter.content ?? []), ...(current.content ?? [])] as JSONContent['content'],
        };
        upsertEditorState(merged);
        bump(v => v + 1);
      }, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [bioStarterTrigger, bump, entityId, spaceId, upsertEditorState]);

  return null;
}
