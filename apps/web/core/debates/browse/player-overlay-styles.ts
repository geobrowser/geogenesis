/** Open rounds playback only. The recording room keeps its own stamps design. */
import { PLAYBACK_FONT_FAMILY, PLAYBACK_OUTLINE_STYLE, PLAYBACK_ROUND_HEADLINE_CLASS } from './playback-typography';

export const PLAYER_PICK_STYLE = { fontFamily: PLAYBACK_FONT_FAMILY, fontWeight: 600 } as const;
export const PLAYER_TITLE_STYLE = {
  fontFamily: PLAYBACK_FONT_FAMILY,
  ...PLAYBACK_OUTLINE_STYLE,
} as const;
export const PLAYER_TITLE_CLASS = `${PLAYBACK_ROUND_HEADLINE_CLASS} text-center leading-[0.95] whitespace-nowrap`;
export const PLAYER_PICK_BASE_CLASS =
  'inline-flex items-center rounded-full px-[5.4cqw] py-[2.4cqw] text-[5.6cqw] leading-none font-semibold whitespace-nowrap';
export const PLAYER_PICK_CLASS = {
  end: 'bg-[rgba(36,36,40,0.48)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[14px]',
  none: 'border-[0.5cqw] border-dashed border-white/60 text-white/80',
} as const;
/** One quiet settle across announcements and picks; reduced motion keeps only the fade. */
export const PLAYER_ENTER_CLASS =
  'animate-[fadeIn_250ms_linear_both] motion-safe:animate-[fadeIn_250ms_linear_both,debatePlayerSettle_250ms_cubic-bezier(0.22,1,0.36,1)_both]';
export const PLAYER_EXIT_MS = 300;
export const PLAYER_EXIT_CLASS = 'animate-[fadeIn_300ms_linear_reverse_both]';

/** Dim and panel entrances use a soft fade without moving the video underneath. */
export const PLAYER_FADE_CLASS = 'animate-[fadeIn_250ms_ease-out_both]';

/** One inherited opacity crossfades all Open rounds furniture with the announcement exit. */
export const PLAYER_FURNITURE_OPACITY = 'var(--debate-furniture-opacity, 1)';
