import '@emotion/react';
import { ColorThemeValue } from './modules/design-system/theme/colors';
import { ShadowScale } from './modules/design-system/theme/shadows';
import { TypographyThemeValue } from './modules/design-system/theme/typography';

declare module '@emotion/react' {
  export interface Theme {
    colors: ColorThemeValue;
    shadows: ShadowScale;
    typography: TypographyThemeValue;
    space: number;
    radius: number;
  }
}
