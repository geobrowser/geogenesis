/** Open rounds playback only. The recording room keeps its own stamps design. */
import { PLAYBACK_FONT_FAMILY, PLAYBACK_OUTLINE_STYLE, PLAYBACK_ROUND_HEADLINE_CLASS } from './playback-typography';

export const PLAYER_LABEL_FONT = { fontFamily: PLAYBACK_FONT_FAMILY, fontWeight: 500 } as const;
export const PLAYER_PICK_STYLE = { fontFamily: PLAYBACK_FONT_FAMILY, fontWeight: 600 } as const;
export const PLAYER_TITLE_STYLE = {
  fontFamily: PLAYBACK_FONT_FAMILY,
  ...PLAYBACK_OUTLINE_STYLE,
} as const;
export const PLAYER_TITLE_CLASS = `${PLAYBACK_ROUND_HEADLINE_CLASS} text-center leading-[0.95] whitespace-nowrap`;
export const PLAYER_GLASS_CLASS =
  'rounded-full bg-black/66 px-[2.2cqw] py-[1.1cqw] leading-none tracking-[0.01em] whitespace-nowrap text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)] backdrop-blur-[10px]';
export const PLAYER_PICK_BASE_CLASS =
  'inline-flex items-center rounded-full px-[5.4cqw] py-[2.4cqw] text-[5.6cqw] leading-none font-semibold whitespace-nowrap';
export const PLAYER_PICK_CLASS = {
  extend: 'bg-white text-[#111] shadow-[0_1cqw_3cqw_rgba(0,0,0,0.2)] backdrop-blur-[14px]',
  end: 'bg-[rgba(36,36,40,0.48)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[14px]',
  none: 'border-[0.5cqw] border-dashed border-white/60 text-white/80',
} as const;
/** Linear fade and cubic settle have separate curves, as in the export. */
export const PLAYER_ENTER_CLASS =
  'animate-[fadeIn_250ms_linear_both] motion-safe:animate-[fadeIn_250ms_linear_both,debatePlayerSettle_250ms_cubic-bezier(0.333333,1,0.666667,1)_both]';
export const PLAYER_EXIT_CLASS = 'animate-[fadeIn_300ms_linear_reverse_both]';
