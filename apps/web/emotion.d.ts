import '@emotion/react';
import { ColorThemeValue } from './modules/design-system/theme/colors';

declare module '@emotion/react' {
  export interface Theme {
    colors: ColorThemeValue;
  }
}
