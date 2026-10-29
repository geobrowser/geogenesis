import * as React from 'react';

/**
 * Test stand-ins for the Today's claims callout (GEO-3498), for suites that draw a surface it sits
 * on — the side panel and the full-screen hub — where only whether and where it is drawn matters.
 * The callout and its day's set have their own suites.
 *
 *   vi.mock('../todays-claims/use-todays-callout', async () =>
 *     (await import('./todays-claims-callout-fixtures')).useTodaysCalloutModule);
 *   vi.mock('./todays-claims-callout', async () =>
 *     (await import('./todays-claims-callout-fixtures')).todaysClaimsCalloutModule);
 *
 * Set `todaysCalloutMock.visible` per case, and reset it in `beforeEach`.
 */
export const todaysCalloutMock = { visible: false };

export const useTodaysCalloutModule = { useTodaysCallout: () => todaysCalloutMock };

/** Its one action stands in for the whole callout: pressing it is pressing Find a debate. */
function TodaysClaimsCallout({ layout, onFindDebate }: { layout: string; onFindDebate: () => void }) {
  return (
    <button type="button" data-testid="todays-claims-callout" data-layout={layout} onClick={onFindDebate}>
      Find a debate
    </button>
  );
}

export const todaysClaimsCalloutModule = { TodaysClaimsCallout };
