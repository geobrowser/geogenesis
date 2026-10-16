/** Open rounds playback only. The recording room keeps its own stamps design. */
export const PLAYER_LABEL_FONT = { fontFamily: 'var(--font-geist-medium)' } as const;
export const PLAYER_TITLE_STYLE = {
  fontFamily: 'var(--font-geist-bold)',
  textShadow:
    '-0.035em -0.035em 0 #000, 0 -0.035em 0 #000, 0.035em -0.035em 0 #000, 0.035em 0 0 #000, 0.035em 0.035em 0 #000, 0 0.035em 0 #000, -0.035em 0.035em 0 #000, -0.035em 0 0 #000, 0 0.05em 0.16em rgba(0,0,0,0.55)',
} as const;
export const PLAYER_TITLE_CLASS = 'text-center leading-none font-bold tracking-[-0.02em] text-white';
const GLASS_SHAPE_CLASS = 'rounded-full border leading-none whitespace-nowrap backdrop-blur-[16px]';
export const PLAYER_GLASS_CLASS = `${GLASS_SHAPE_CLASS} border-white/20 bg-black/45 px-[2.2cqw] py-[1.2cqw]`;
export const PLAYER_PICK_BASE_CLASS = `${GLASS_SHAPE_CLASS} px-[4cqw] py-[2cqw]`;
export const PLAYER_PICK_CLASS = {
  extend: 'border-white/70 bg-white/90 text-black',
  end: 'border-white/20 bg-black/60 text-white',
  none: 'border-dashed border-white/50 bg-black/35 text-white/75',
} as const;
/** Keep the held start time even with reduced motion, without the small scale settle. */
export const PLAYER_ENTER_CLASS =
  'animate-[fadeIn_1ms_linear_both] motion-safe:animate-[debatePlayerEnter_220ms_ease-out_both]';
export const PLAYER_EXIT_CLASS =
  'animate-[fadeIn_1ms_linear_reverse_both] motion-safe:animate-[fadeIn_300ms_linear_reverse_both]';
