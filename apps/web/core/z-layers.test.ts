import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Z_LAYERS, Z_LAYER_CLASS } from './z-layers';

const styles = readFileSync('styles/styles.css', 'utf8');

describe('Z_LAYERS', () => {
  // GEO-3849: a signed-out vote inside the graph explorer's phone panel sheet opens the save-votes
  // prompt, which painted behind the sheet and was dismissed unseen by the next tap.
  it('puts the save-votes prompt above bottom sheets, which it can be opened from', () => {
    expect(Z_LAYERS.saveVotesDialog).toBeGreaterThan(Z_LAYERS.bottomSheet);
    expect(Z_LAYERS.bottomSheet).toBeGreaterThan(Z_LAYERS.bottomSheetBackdrop);
  });

  it('keeps the save-votes prompt above everything else, and bottom sheets above all but it', () => {
    const { saveVotesDialog, bottomSheet, bottomSheetBackdrop, ...rest } = Z_LAYERS;
    const restMax = Math.max(...Object.values(rest));
    expect(bottomSheetBackdrop).toBeGreaterThan(restMax);
    expect(saveVotesDialog).toBe(Math.max(...Object.values(Z_LAYERS)));
  });

  it('spells the same numbers in the classes', () => {
    expect(Z_LAYER_CLASS.saveVotesDialog).toBe(`z-[${Z_LAYERS.saveVotesDialog}]`);
    expect(Z_LAYER_CLASS.bottomSheet).toBe(`z-[${Z_LAYERS.bottomSheet}]`);
    expect(Z_LAYER_CLASS.bottomSheetBackdrop).toBe(`z-[${Z_LAYERS.bottomSheetBackdrop}]`);
  });

  // The "Opening sign-in" overlay lives in styles.css and stays over every app layer, below Privy.
  it('leaves the sign-in pending overlay above every layer', () => {
    const block = styles.match(/html\[data-sign-in-pending\] #sign-in-pending \{[^}]*\}/)?.[0] ?? '';
    const z = Number(block.match(/z-index:\s*(\d+)/)?.[1]);
    expect(z).toBeGreaterThan(Math.max(...Object.values(Z_LAYERS)));
  });
});
