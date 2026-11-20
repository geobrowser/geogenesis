/**
 * GEO-3817 test: a hand-made landscape share video for one debate, to see how the full experience
 * plays on X and in iMessage before building it for every debate. Rendered from the debate's reel
 * (the hook moment, a claim screen with Agree and Disagree, four more moments, an end screen) and
 * stored on Geo's IPFS storage. The player overlays real links on the buttons drawn into the video,
 * shown only while those screens are on.
 *
 * Times are seconds into the video; rectangles are fractions of the 16:9 frame.
 */
export type ShareTestRect = { x: number; y: number; w: number; h: number };

export type ShareTestExperience = {
  videoUrl: string;
  cardUrl: string;
  video: { width: number; height: number };
  /** The claim screen with Agree and Disagree, after the hook. */
  claim: { start: number; end: number; agree: ShareTestRect; disagree: ShareTestRect };
  /** While the reel plays after the claim screen: Watch on Geo, top right. */
  reel: { start: number; end: number; watch: ShareTestRect };
  /** The end screen, kept up once the video ends. */
  end: { start: number; agree: ShareTestRect; disagree: ShareTestRect; full: ShareTestRect };
};

const GATEWAY = 'https://mature-tomato-basilisk.myfilebase.com/ipfs/';

export const SHARE_TEST_EXPERIENCES: Record<string, ShareTestExperience> = {
  // Dovile Sv vs. Preston Mantel: "Bitcoin is a better store of value than gold".
  '01a039bdac2c7ec097758284ce61200d': {
    videoUrl: `${GATEWAY}QmagHSggaEudGHSaAddAMvWw85WZDCkcKui7kxhutzJQSK`,
    cardUrl: `${GATEWAY}Qme7KEyDjWjnafepJhzosAmGyCVwzC1ASSx6LWTt7AhP5k`,
    video: { width: 1280, height: 720 },
    claim: {
      start: 6.615,
      end: 12.615,
      agree: { x: 0.3406, y: 0.5906, w: 0.1531, h: 0.0833 },
      disagree: { x: 0.5062, y: 0.5906, w: 0.1531, h: 0.0833 },
    },
    reel: { start: 12.615, end: 94.099, watch: { x: 0.8337, y: 0.0528, w: 0.1444, h: 0.0611 } },
    end: {
      start: 94.099,
      agree: { x: 0.3406, y: 0.5545, w: 0.1531, h: 0.0833 },
      disagree: { x: 0.5062, y: 0.5545, w: 0.1531, h: 0.0833 },
      full: { x: 0.3448, y: 0.8611, w: 0.3104, h: 0.0778 },
    },
  },
};

export function shareTestExperience(debateId: string): ShareTestExperience | null {
  return SHARE_TEST_EXPERIENCES[debateId.replace(/-/g, '').toLowerCase()] ?? null;
}
