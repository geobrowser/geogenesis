'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useAtom } from 'jotai';
import * as React from 'react';

import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useBlocks, relationWithBlockIsMarkdownTextBody } from '~/core/state/editor/use-blocks';
import { useEditable } from '~/core/state/editable-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { getPersonalProfileSkillsRelationFocusRoot } from '~/core/utils/personal-profile-skills-focus';

import {
  personalProfileSkillsRowIntentAtom,
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
  propertyIsSkillsProperty,
} from '~/atoms/personal-profile-suggested';
import {
  profileOverviewTextBlockMarkdownForContentCheck,
  stripProfileOverviewMarkdownNoise,
} from '~/core/state/editor/profile-overview-tail-placeholder';

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
    selector: r =>
      r.spaceId === spaceId &&
      !r.isDeleted &&
      r.toEntity.id === entityId &&
      r.fromEntity.id !== entityId,
  });

  const postEntityIds = React.useMemo(
    () => new Set(postTypeRelations.map(r => r.fromEntity.id)),
    [postTypeRelations]
  );

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

  React.useEffect(() => {
    if (dismissForever) return;

    const bioDone = stripProfileOverviewMarkdownNoise(overviewTextMarkdownJoined).length > 0;

    let skillsDone = false;
    for (const prop of Object.values(rendered)) {
      if (propertyIsSkillsProperty(prop.id)) {
        skillsDone = true;
        break;
      }
    }

    const next = {
      bio: bioDone,
      work: true,
      education: true,
      skills: skillsDone,
      post: hasPostAuthoredByProfile,
    };

    if (
      next.bio !== tasks.bio ||
      next.skills !== tasks.skills ||
      next.post !== tasks.post ||
      next.work !== tasks.work ||
      next.education !== tasks.education
    ) {
      setTasks(next);
    }
  }, [
    dismissForever,
    entityId,
    hasPostAuthoredByProfile,
    rendered,
    overviewTextMarkdownJoined,
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
