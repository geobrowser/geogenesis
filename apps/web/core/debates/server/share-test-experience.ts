/**
 * GEO-3817 test: a hand-made landscape share video for one debate, to see how the full experience
 * plays on X and in iMessage before building it for every debate. Rendered from the debate's reel
 * (the hook moment, a claim screen, four more moments, an end screen) after the Geo Debate Clip
 * design, and stored on Geo's IPFS storage. The video carries no buttons: they only work in the X
 * player, which draws them on top while their screen is on, in the room the screens leave for them.
 *
 * Times are seconds into the video; rectangles are fractions of the 16:9 frame.
 */
export type ShareTestRect = { x: number; y: number; w: number; h: number };

export type ShareTestExperience = {
  videoUrl: string;
  cardUrl: string;
  video: { width: number; height: number };
  /** The claim screen after the hook: Agree and Disagree, light on the dark title card. */
  claim: { start: number; end: number; agree: ShareTestRect; disagree: ShareTestRect };
  /** While the reel plays after the claim screen: Watch on Geo, top right. */
  reel: { start: number; end: number };
  /** The white end screen, kept up once the video ends: Agree, Disagree and the full debate. */
  end: { start: number; agree: ShareTestRect; disagree: ShareTestRect; full: ShareTestRect };
};

const GATEWAY = 'https://mature-tomato-basilisk.myfilebase.com/ipfs/';

export const SHARE_TEST_EXPERIENCES: Record<string, ShareTestExperience> = {
  // Dovile Sv vs. Preston Mantel: "Bitcoin is a better store of value than gold".
  '01a039bdac2c7ec097758284ce61200d': {
    videoUrl: `${GATEWAY}QmQjMhGrbWGX9MmFA7fuXa3zsJAFarWbRaFUHoEuNZBNue`,
    cardUrl: `${GATEWAY}QmXhWR13buN3kxHH9jTPEF5q2xrYh7Dda4tLw8GKPZDZfV`,
    video: { width: 1280, height: 720 },
    claim: {
      start: 6.5,
      end: 12.5,
      agree: { x: 0.3094, y: 0.6944, w: 0.1719, h: 0.0889 },
      disagree: { x: 0.4953, y: 0.6944, w: 0.1953, h: 0.0889 },
    },
    reel: { start: 12.5, end: 77.37 },
    end: {
      start: 77.37,
      agree: { x: 0.3094, y: 0.5167, w: 0.1719, h: 0.0889 },
      disagree: { x: 0.4953, y: 0.5167, w: 0.1953, h: 0.0889 },
      full: { x: 0.273, y: 0.8111, w: 0.4539, h: 0.0889 },
    },
  },
};

export function shareTestExperience(debateId: string): ShareTestExperience | null {
  return SHARE_TEST_EXPERIENCES[debateId.replace(/-/g, '').toLowerCase()] ?? null;
}
