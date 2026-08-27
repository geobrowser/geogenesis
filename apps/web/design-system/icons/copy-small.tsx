import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  /**
   * Rendered size. The 12px default matches the other `*Small` glyphs it sits with in the row menu;
   * a row control passes 19 to sit level with `SidePanel`. Scaling the whole drawing takes the
   * stroke with it, so the weight stays right at either size.
   */
  size?: number;
}

/**
 * The 12px companion to {@link Copy}, for the row-action clusters where every other glyph is drawn
 * at 12 — `RelationSmall`, `TickSmall`. Same two-sheet arrangement as the 16px original: the back
 * sheet closed, the front one drawn as an open path so they read as overlapping rather than as one
 * shape with a line through it.
 */
export function CopySmall({ color, size = 12 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="0.5" width="8" height="8" rx="2" stroke={themeColor} />
      <path
        d="M8.5 8.5V9.5C8.5 10.6046 7.60457 11.5 6.5 11.5H2.5C1.39543 11.5 0.5 10.6046 0.5 9.5V5.5C0.5 4.39543 1.39543 3.5 2.5 3.5H3.5"
        stroke={themeColor}
      />
    </svg>
  );
}
