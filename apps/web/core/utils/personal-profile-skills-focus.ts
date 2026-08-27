'use client';

export const PERSONAL_PROFILE_SKILLS_FOCUS_SELECTOR = '[data-personal-profile-focus="skills"]';

export function getPersonalProfileSkillsRelationFocusRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(PERSONAL_PROFILE_SKILLS_FOCUS_SELECTOR);
}

export function getPersonalProfileSkillsRelationFindInput(): HTMLInputElement | null {
  const root = getPersonalProfileSkillsRelationFocusRoot();
  return (
    root?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])') ??
    null
  );
}

export function isPersonalProfileSkillsRelationFocusRegionActive(): boolean {
  try {
    const root = getPersonalProfileSkillsRelationFocusRoot();
    const active = document.activeElement;
    return Boolean(root && active && root.contains(active));
  } catch {
    return false;
  }
}
