const EXPLORE_CURATOR_WELCOME_CARD_BACK_SRC = '/images/explore/explore-curator-welcome-card-back.png';
const EXPLORE_CURATOR_WELCOME_CARD_MID_SRC = '/images/explore/explore-curator-welcome-card-mid.png';
const EXPLORE_CURATOR_WELCOME_CARD_FRONT_SRC = '/images/explore/explore-curator-welcome-card-front.png';

const CARD_IMAGE_CLASS =
  'absolute rounded-[10px] border border-white/80 object-cover shadow-[0_8px_20px_rgba(0,0,0,0.12)]';

export function ExploreCuratorWelcomeBanner() {
  return (
    <section
      aria-label="Become a curator"
      className="relative box-border h-[127px] overflow-hidden rounded-[16px] bg-[#151515]"
    >
      <div className="relative z-10 flex h-full flex-col justify-center gap-3 px-5 pr-[188px]">
        <h2 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-white">
          👋 Welcome to Geo - Become a curator!
        </h2>
        <p className="max-w-[540px] text-[16px] leading-[16px] font-normal tracking-[-0.35px] text-white">
          Help organize topics, questions, claims, and relevant sources to improve the quality of discourse. Join spaces
          and start contributing there.
        </p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-0 h-[114px] w-[142px] translate-x-6 -translate-y-1/2"
      >
        <img
          src={EXPLORE_CURATOR_WELCOME_CARD_BACK_SRC}
          alt=""
          width={50}
          height={50}
          className={`${CARD_IMAGE_CLASS} top-[32px] left-0 z-0 h-[50px] w-[50px] -rotate-[14deg] object-[center_35%]`}
          draggable={false}
        />
        <img
          src={EXPLORE_CURATOR_WELCOME_CARD_MID_SRC}
          alt=""
          width={85}
          height={85}
          className={`${CARD_IMAGE_CLASS} top-[15px] left-6 z-10 h-[85px] w-[85px] rotate-[7deg]`}
          draggable={false}
        />
        <img
          src={EXPLORE_CURATOR_WELCOME_CARD_FRONT_SRC}
          alt=""
          width={70}
          height={114}
          className={`${CARD_IMAGE_CLASS} top-0 left-[72px] z-20 h-[114px] w-[70px] rotate-[11deg]`}
          draggable={false}
        />
      </div>
    </section>
  );
}
