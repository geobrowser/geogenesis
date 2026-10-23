import { describe, expect, it } from 'vitest';

import { toEmailSettings } from './email-settings-link';

describe('toEmailSettings', () => {
  it('opens email settings on Explore by default', () => {
    expect(toEmailSettings()).toBe('/explore?modal=email-settings');
  });

  it("keeps a page's own query and fragment, and carries attribution", () => {
    expect(toEmailSettings('/space/abc?tab=x#top', 'email')).toBe(
      '/space/abc?tab=x&modal=email-settings&via=email#top'
    );
  });
});
