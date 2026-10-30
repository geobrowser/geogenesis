import { describe, expect, it } from 'vitest';

import { todaysCardScope } from './todays-claims-attribution';

describe('todaysCardScope', () => {
  it('names the agenda, its day as written, the section and the debates since the listing', () => {
    expect(todaysCardScope('agenda-28', '2026-10-28T04:00:00Z', 2, 'block-brazil')).toEqual({
      agenda_id: 'agenda-28',
      agenda_date: '2026-10-28',
      list_section_id: 'block-brazil',
      debated_since_listing: 2,
    });
  });

  // Zero is a count; unknown (geo-chat could not say) is left out rather than reported as zero.
  it('keeps a zero count and leaves out an unknown one and a missing section', () => {
    expect(todaysCardScope('agenda-26', '2026-10-26T00:00:00-04:00', 0)).toEqual({
      agenda_id: 'agenda-26',
      agenda_date: '2026-10-26',
      debated_since_listing: 0,
    });
    expect(todaysCardScope('agenda-26', '2026-10-26T00:00:00-04:00', undefined)).toEqual({
      agenda_id: 'agenda-26',
      agenda_date: '2026-10-26',
    });
  });
});
