import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  /**
   * Whether the rounded body is painted white. It exists to keep the dots legible where the glyph
   * overlaps content; a control sitting in its own space wants the row's background showing
   * through instead of a white chip stamped onto it.
   */
  filled?: boolean;
  /** Rendered size. Defaults to the 16px this is drawn at; a row control passes 19 to sit level
   *  with `SidePanel` and the copy glyph. */
  size?: number;
}

export function Menu({ color, filled = true, size = 16 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="15" height="15" rx="5.5" fill={filled ? 'white' : 'none'} stroke={themeColor} />
      <ellipse cx="4.5" cy="8" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="8" cy="8" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="11.5" cy="8" rx="1" ry="1" fill={themeColor} />
    </svg>
  );
}
