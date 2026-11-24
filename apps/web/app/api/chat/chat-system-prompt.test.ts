import { describe, expect, it } from 'vitest';

import { INGESTION_SYSTEM_PROMPT, renderCurrentContextSection } from './chat-system-prompt';

const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const context = {
  currentSpaceId: PAGE_SPACE,
  currentEntityId: null,
  currentPath: '/space/x',
  isEditMode: false,
};

describe('renderCurrentContextSection write space (GEO-3819)', () => {
  it("names the server's personal space as the write space for a non-member's import", () => {
    const section = renderCurrentContextSection({ ...context, writeToPersonalSpace: true }, PERSONAL_SPACE) ?? '';
    expect(section).toContain(`- Write space id: \`${PERSONAL_SPACE}\``);
    expect(section).toContain(`- Current space id: \`${PAGE_SPACE}\``);
  });

  it('gives no write space for an ordinary import', () => {
    expect(renderCurrentContextSection(context, PERSONAL_SPACE)).not.toContain('Write space id');
  });

  it('gives no write space without a server-resolved personal space, whatever the client asks', () => {
    expect(renderCurrentContextSection({ ...context, writeToPersonalSpace: true }, null)).not.toContain(
      'Write space id'
    );
  });

  it('the ingestion prompt sends every write, the link included, to the write space when one is given', () => {
    expect(INGESTION_SYSTEM_PROMPT).toContain('unless the Current context gives a Write space id');
  });
});
