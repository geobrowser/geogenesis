'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useAtom } from 'jotai';

import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditable } from '~/core/state/editable-store';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import {
  profileOverviewTextBlockMarkdownForContentCheck,
  stripProfileOverviewMarkdownNoise,
} from '~/core/state/editor/profile-overview-tail-placeholder';
import { relationWithBlockIsMarkdownTextBody, useBlocks } from '~/core/state/editor/use-blocks';
import { useRelations, useValues } from '~/core/sync/use-store';
import { getPersonalProfileSkillsRelationFocusRoot } from '~/core/utils/personal-profile-skills-focus';

import {
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
  propertyIsSkillsProperty,
} from '~/atoms/personal-profile-suggested';

export function PersonalProfileSuggestedTaskSync({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { id: pageEntityId, spaceId: editorSpaceId, initialBlockRelations, initialBlocks } = useEditorInstance();
  const overviewBlockRelations = useBlocks(pageEntityId, editorSpaceId, initialBlockRelations);

  const blockEntityById = React.useMemo(() => new Map(initialBlocks.map(b => [b.id, b])), [initialBlocks]);

  const overviewTextBlockIdSet = React.useMemo(
    () =>
      new Set(
        overviewBlockRelations
          .filter(r => relationWithBlockIsMarkdownTextBody(r, blockEntityById.get(r.block.id)))
          .map(r => r.block.id)
      ),
    [overviewBlockRelations, blockEntityById]
  );

  const initialOverviewMarkdownValues = React.useMemo(() => {
    return initialBlocks
      .filter(b => overviewTextBlockIdSet.has(b.id))
      .flatMap(b => b.values.filter(v => v.property.id === SystemIds.MARKDOWN_CONTENT));
  }, [initialBlocks, overviewTextBlockIdSet]);

  const overviewMarkdownValues = useValues({
    mergeWith: initialOverviewMarkdownValues,
    selector: v =>
      v.spaceId === editorSpaceId &&
      v.property.id === SystemIds.MARKDOWN_CONTENT &&
      !v.isDeleted &&
      overviewTextBlockIdSet.has(v.entity.id),
  });

  const overviewTextMarkdownJoined = React.useMemo(() => {
    return overviewBlockRelations
      .filter(r => relationWithBlockIsMarkdownTextBody(r, blockEntityById.get(r.block.id)))
      .map(r => {
        const live = overviewMarkdownValues.find(v => v.entity.id === r.block.id);
        const markdown = live?.value ?? '';
        return profileOverviewTextBlockMarkdownForContentCheck(markdown);
      })
      .join('\n');
  }, [overviewBlockRelations, overviewMarkdownValues, blockEntityById]);
  const rendered = useRenderedPropertiesWithContent(entityId, spaceId);
  const [tasks, setTasks] = useAtom(personalProfileSuggestedTasksAtom);
  const [{ forever: dismissForever }] = useAtom(personalProfileSuggestedDismissAtom);

  const postTypeRelations = useRelations({
    selector: r =>
      r.spaceId === spaceId &&
      !r.isDeleted &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.toEntity.id === SystemIds.POST_TYPE,
  });

  const relationsTargetingProfile = useRelations({
    selector: r => r.spaceId === spaceId && !r.isDeleted && r.toEntity.id === entityId && r.fromEntity.id !== entityId,
  });

  const postEntityIds = React.useMemo(() => new Set(postTypeRelations.map(r => r.fromEntity.id)), [postTypeRelations]);

  const hasPostAuthoredByProfile = React.useMemo(
    () => relationsTargetingProfile.some(r => postEntityIds.has(r.fromEntity.id)),
    [relationsTargetingProfile, postEntityIds]
  );
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

  const skillsDone = React.useMemo(() => {
    for (const prop of Object.values(rendered)) {
      if (propertyIsSkillsProperty(prop.id)) return true;
    }
    return false;
  }, [rendered]);

  const bioDone = React.useMemo(
    () => stripProfileOverviewMarkdownNoise(overviewTextMarkdownJoined).length > 0,
    [overviewTextMarkdownJoined]
  );

  // Debounced sync: the underlying reactive store can briefly emit transient states
  // while local edits resettle (e.g. after deleting a freshly-added overview block).
  // Writing eagerly causes the persisted atom to flip back and forth, which renders
  // as a check/plus flicker on the Get Started pills. Coalesce into one write after
  // the computed values have been stable for a short window.
  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  const setTasksRef = React.useRef(setTasks);
  setTasksRef.current = setTasks;

  React.useEffect(() => {
    if (dismissForever) return;

    const next = {
      bio: bioDone,
      work: true,
      education: true,
      skills: skillsDone,
      post: hasPostAuthoredByProfile,
    };

    const current = tasksRef.current;
    if (
      next.bio === current.bio &&
      next.skills === current.skills &&
      next.post === current.post &&
      next.work === current.work &&
      next.education === current.education
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTasksRef.current(next);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [dismissForever, bioDone, skillsDone, hasPostAuthoredByProfile]);

  return null;
}
