'use client';

import { usePathname } from 'next/navigation';
import { useAtom } from 'jotai';
import * as React from 'react';

import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useEditable } from '~/core/state/editable-store';
import { getPersonalProfileSkillsRelationFocusRoot } from '~/core/utils/personal-profile-skills-focus';

import {
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
  propertyIsSkillsProperty,
} from '~/atoms/personal-profile-suggested';
import {
  PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL,
  PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT,
} from '~/core/state/editor/profile-overview-tail-placeholder';

function overviewMarkdownWithoutTailNoise(markdown: string): string {
  const lines = markdown.split('\n').flatMap(line => {
    const t = line.trim();
    if (!t) return [];
    if (t === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) return [];
    if (t === PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL) return [];
    if (/^Type \/ for commands or start writ/i.test(t)) return [];
    return [line];
  });
  return lines.join('\n').trim();
}

export function PersonalProfileSuggestedTaskSync({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { serverBlocks } = useEditorStore();
  const rendered = useRenderedPropertiesWithContent(entityId, spaceId);
  const pathname = usePathname();
  const [tasks, setTasks] = useAtom(personalProfileSuggestedTasksAtom);
  const [{ forever: dismissForever }, setDismiss] = useAtom(personalProfileSuggestedDismissAtom);
  const [skillsIntent, setSkillsIntent] = useAtom(personalProfileSkillsRowIntentAtom);
  const canEdit = useUserIsEditing(spaceId);
  const { setEditable } = useEditable();

  // Turn on edit mode from intent only — do not couple scroll/poll to `canEdit` in deps (avoids restart storms).
  React.useEffect(() => {
    if (!skillsIntent || skillsIntent.entityId !== entityId || skillsIntent.spaceId !== spaceId) return;
    if (!skillsIntent.pendingEnableEdit) return;
    if (!canEdit) {
      setEditable(true);
      return;
    }
    setSkillsIntent(i => (i ? { ...i, pendingEnableEdit: false } : null));
  }, [skillsIntent, entityId, spaceId, canEdit, setEditable, setSkillsIntent]);

  React.useEffect(() => {
    if (!skillsIntent || skillsIntent.entityId !== entityId || skillsIntent.spaceId !== spaceId) return;
    if (skillsIntent.pendingEnableEdit) return;
    if (!canEdit) return;

    const focusFindCreateInput = skillsIntent.focusFindCreateInput;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50;
    let pollTimeoutId: number | null = null;

    const clearPoll = () => {
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    };

    const tryScrollOrFocus = () => {
      if (cancelled) return;
      attempts += 1;
      const root = getPersonalProfileSkillsRelationFocusRoot();
      if (root) {
        root.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          window.requestAnimationFrame(() => {
            if (cancelled) return;
            if (focusFindCreateInput) {
              const input = root.querySelector<HTMLInputElement>(
                'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
              );
              try {
                input?.focus();
              } catch {
                /* detached */
              }
            }
            setSkillsIntent(null);
          });
        });
        return;
      }
      if (attempts < maxAttempts) {
        clearPoll();
        pollTimeoutId = window.setTimeout(tryScrollOrFocus, 80);
      } else {
        setSkillsIntent(null);
      }
    };

    tryScrollOrFocus();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [skillsIntent, entityId, spaceId, canEdit, setSkillsIntent]);

  React.useEffect(() => {
    if (dismissForever) return;

    const textMarkdown = serverBlocks
      .filter(s => s.type === 'text')
      .map(s => s.markdown)
      .join('\n');

    const bioDone = overviewMarkdownWithoutTailNoise(textMarkdown).length > 0;

    let skillsDone = false;
    for (const prop of Object.values(rendered)) {
      if (propertyIsSkillsProperty(prop.id)) {
        skillsDone = true;
        break;
      }
    }

    const postDone =
      tasks.post ||
      (typeof pathname === 'string' && pathname.includes(`/${entityId}/activity`));

    const next = {
      bio: bioDone || tasks.bio,
      work: true,
      education: true,
      skills: skillsDone,
      post: postDone || tasks.post,
    };

    const allDone = next.bio && next.skills && next.post;

    if (
      next.bio !== tasks.bio ||
      next.skills !== tasks.skills ||
      next.post !== tasks.post ||
      next.work !== tasks.work ||
      next.education !== tasks.education
    ) {
      setTasks(next);
    }

    if (allDone) {
      setDismiss(d => ({ ...d, forever: true }));
    }
  }, [
    dismissForever,
    entityId,
    pathname,
    rendered,
    serverBlocks,
    setDismiss,
    setTasks,
    spaceId,
    tasks.bio,
    tasks.education,
    tasks.post,
    tasks.skills,
    tasks.work,
  ]);


  return null;
}
