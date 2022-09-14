import '@emotion/react';
import { ColorThemeValue } from './modules/design-system/theme/colors';
import { TypographyThemeValue } from './modules/design-system/theme/typography';

declare module '@emotion/react' {
  export interface Theme {
    colors: ColorThemeValue;
    typography: TypographyThemeValue;
  }
}
