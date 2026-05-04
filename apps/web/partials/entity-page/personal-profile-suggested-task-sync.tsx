'use client';

import { usePathname } from 'next/navigation';
import { useAtom } from 'jotai';
import * as React from 'react';

import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useEditorStore } from '~/core/state/editor/use-editor';

import {
  personalProfileSuggestedDismissAtom,
  personalProfileSuggestedTasksAtom,
} from '~/atoms/personal-profile-suggested';
import { PERSONAL_PROFILE_BIO_STARTER_MARKER } from '~/partials/entity-page/personal-profile-bio-starter';

function propertyNameMatchesWork(name: string): boolean {
  return /employ|work|role|career|position|company|job|employment/i.test(name);
}

function propertyNameMatchesEducation(name: string): boolean {
  return /education|school|degree|university|study/i.test(name);
}

function propertyNameMatchesSkills(name: string): boolean {
  return /skill/i.test(name);
}

export function PersonalProfileSuggestedTaskSync({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { serverBlocks } = useEditorStore();
  const rendered = useRenderedPropertiesWithContent(entityId, spaceId);
  const pathname = usePathname();
  const [tasks, setTasks] = useAtom(personalProfileSuggestedTasksAtom);
  const [{ forever: dismissForever }, setDismiss] = useAtom(personalProfileSuggestedDismissAtom);

  React.useEffect(() => {
    if (dismissForever) return;

    const textMarkdown = serverBlocks
      .filter(s => s.type === 'text')
      .map(s => s.markdown)
      .join('\n');

    const bioDone =
      textMarkdown.trim().length > 0 && !textMarkdown.includes(PERSONAL_PROFILE_BIO_STARTER_MARKER);

    let workDone = tasks.work;
    let educationDone = tasks.education;
    let skillsDone = tasks.skills;

    for (const prop of Object.values(rendered)) {
      const name = prop.name ?? '';
      if (propertyNameMatchesWork(name)) workDone = true;
      if (propertyNameMatchesEducation(name)) educationDone = true;
      if (propertyNameMatchesSkills(name)) skillsDone = true;
    }

    const postDone =
      tasks.post ||
      (typeof pathname === 'string' && pathname.includes(`/${entityId}/activity`));

    const next = {
      bio: bioDone || tasks.bio,
      work: workDone || tasks.work,
      education: educationDone || tasks.education,
      skills: skillsDone || tasks.skills,
      post: postDone || tasks.post,
    };

    const allDone = next.bio && next.work && next.education && next.skills && next.post;

    if (
      next.bio !== tasks.bio ||
      next.work !== tasks.work ||
      next.education !== tasks.education ||
      next.skills !== tasks.skills ||
      next.post !== tasks.post
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
