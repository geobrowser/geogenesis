/** Open rounds playback only. The recording room keeps its own stamps design. */
export const PLAYER_LABEL_FONT = { fontFamily: 'var(--font-geist-medium)' } as const;
export const PLAYER_TITLE_STYLE = {
  fontFamily: 'var(--font-geist-bold)',
  textShadow:
    '-0.04em -0.04em 0 #000, 0 -0.04em 0 #000, 0.04em -0.04em 0 #000, 0.04em 0 0 #000, 0.04em 0.04em 0 #000, 0 0.04em 0 #000, -0.04em 0.04em 0 #000, -0.04em 0 0 #000, 0 0.06em 0.18em rgba(0,0,0,0.55)',
} as const;
export const PLAYER_TITLE_CLASS =
  'text-center leading-[0.95] font-bold tracking-[-0.02em] whitespace-nowrap text-white';
export const PLAYER_GLASS_CLASS =
  'rounded-full bg-black/66 px-[2.2cqw] py-[1.1cqw] leading-none tracking-[0.01em] whitespace-nowrap text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)] backdrop-blur-[10px]';
export const PLAYER_PICK_BASE_CLASS =
  'inline-flex items-center rounded-full px-[5.4cqw] py-[2.4cqw] text-[5.6cqw] leading-none font-semibold whitespace-nowrap';
export const PLAYER_PICK_CLASS = {
  extend: 'bg-white text-[#111] shadow-[0_1cqw_3cqw_rgba(0,0,0,0.2)]',
  end: 'bg-[rgba(36,36,40,0.48)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[14px]',
  none: 'border-[0.5cqw] border-dashed border-white/60 text-white/80',
} as const;
/** Keep the held start time even with reduced motion, without the small scale settle. */
export const PLAYER_ENTER_CLASS =
  'animate-[fadeIn_1ms_linear_both] motion-safe:animate-[debatePlayerEnter_250ms_ease-out_both]';
export const PLAYER_EXIT_CLASS =
  'animate-[fadeIn_1ms_linear_reverse_both] motion-safe:animate-[fadeIn_300ms_linear_reverse_both]';
