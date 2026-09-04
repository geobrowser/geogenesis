import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';

import { buildFollowUpCapabilityNote } from './follow-up-capabilities';

const asTools = (...names: string[]): ToolSet =>
  Object.fromEntries(names.map(name => [name, {}])) as unknown as ToolSet;

describe('buildFollowUpCapabilityNote', () => {
  it('lists the tools it was handed', () => {
    const note = buildFollowUpCapabilityNote(asTools('createEntity', 'searchGraph'));

    expect(note).toContain('createEntity');
    expect(note).toContain('searchGraph');
  });

  it('names every tool, so a newly added one needs no prompt edit', () => {
    const note = buildFollowUpCapabilityNote(asTools('createEntity', 'setEntityImage', 'brandNewTool'));

    expect(note).toContain('brandNewTool');
  });

  it('orders names so the prompt is stable across requests', () => {
    const one = buildFollowUpCapabilityNote(asTools('searchGraph', 'createEntity'));
    const two = buildFollowUpCapabilityNote(asTools('createEntity', 'searchGraph'));

    expect(one).toBe(two);
  });

  it('rules out the abilities the chat has no control for', () => {
    const note = buildFollowUpCapabilityNote(asTools('setEntityImage'));

    expect(note).toMatch(/cannot receive a photo, image or document/);
    expect(note).toMatch(/cannot send email/);
  });

  it('does not deny the spreadsheet attachment the import feature adds', () => {
    // The chat does have one attachment control. Claiming otherwise made the
    // assistant tell a user who had just attached a CSV that it could not
    // receive files at all, and point them at a different part of the app.
    const note = buildFollowUpCapabilityNote(asTools('proposeImportMapping'));

    expect(note).toMatch(/CSV or Excel spreadsheet/);
    expect(note).not.toMatch(/no upload control/);
  });

  it('makes the model name the tool before offering an option', () => {
    const note = buildFollowUpCapabilityNote(asTools('createEntity'));

    expect(note).toMatch(/name to yourself the tool/);
  });

  it("asks for the user's voice, since a click sends the text as their message", () => {
    const note = buildFollowUpCapabilityNote(asTools('createEntity'));

    expect(note).toMatch(/user's own message/);
    expect(note).toMatch(/user's voice/);
    expect(note).toContain("I'll add the photo property");
  });

  it('keeps the voice rule even when no tools are available', () => {
    const note = buildFollowUpCapabilityNote({} as ToolSet);

    expect(note).toMatch(/user's voice/);
  });

  it('tells a toolless caller to suggest no actions at all', () => {
    const note = buildFollowUpCapabilityNote({} as ToolSet);

    expect(note).toContain('no tools available');
    expect(note).not.toContain('acts solely by calling these tools:');
  });

  it('reflects a signed-out tool set, which carries no write tools', () => {
    const guest = buildFollowUpCapabilityNote(asTools('searchGraph', 'listSpaces', 'navigate'));

    expect(guest).not.toContain('createEntity');
    expect(guest).not.toContain('setEntityValue');
  });
});
