import { cva } from 'class-variance-authority';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Link from 'next/link';

import { useCallback, useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { EditSmall } from '~/design-system/icons/edit-small';
import { InProgressSmall } from '~/design-system/icons/in-progress-small';
import { InfoSmall } from '~/design-system/icons/info-small';
import { Member } from '~/design-system/icons/member';
import { VideoSmall } from '~/design-system/icons/video-small';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import { ActiveProposalsForSpacesWhereEditor } from './fetch-active-proposals-in-editor-spaces';

type PersonalHomeView = 'all' | 'requests' | 'proposals';

const viewLabel: Record<PersonalHomeView, string> = {
  all: 'All',
  proposals: 'Active Proposals',
  requests: 'Membership Requests',
};

type PersonalHomeDashboardProps = {
  activeProposals: ActiveProposalsForSpacesWhereEditor;
  acceptedProposalsCount: number;
  proposalsList: React.ReactNode;
};

const personalHomeViewAtom = atomWithStorage<PersonalHomeView>('personalHomeView', 'all');

export function PersonalHomeDashboard({
  activeProposals,
  acceptedProposalsCount,
  proposalsList,
}: PersonalHomeDashboardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [personalHomeView, setPersonalHomeView] = useAtom(personalHomeViewAtom);

  const hasNoActivity = activeProposals.totalCount === 0;

  return (
    <>
      <div className="mt-4 flex justify-between">
        <Menu
          open={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          asChild
          trigger={<SmallButton icon={<ChevronDownSmall />}>{viewLabel[personalHomeView]}</SmallButton>}
          align="start"
        >
          <Link
            href="/"
            onClick={() => {
              setPersonalHomeView('all');
              setIsMenuOpen(false);
            }}
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
          >
            <Text variant="button" className="hover:!text-text">
              All
            </Text>
          </Link>
          <Link
            href="/"
            onClick={() => {
              setPersonalHomeView('proposals');
              setIsMenuOpen(false);
            }}
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
          >
            <Text variant="button" className="hover:!text-text">
              Active proposals
            </Text>
          </Link>
          <Link
            href="/"
            onClick={() => {
              setPersonalHomeView('requests');
              setIsMenuOpen(false);
            }}
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
          >
            <Text variant="button" className="hover:!text-text">
              Membership requests
            </Text>
          </Link>
        </Menu>
      </div>
      <div className="mt-8 flex gap-8">
        <div className="w-2/3">
          {hasNoActivity && <NoActivity />}
          <Notices />
          {!hasNoActivity && proposalsList}
        </div>
        <div className="w-1/3">
          <Sidebar acceptedProposalsCount={acceptedProposalsCount} />
        </div>
      </div>
    </>
  );
}

function NoActivity() {
  return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
}

const Notices = () => {
  return (
    <div className="mb-2 space-y-2">
      <Notice
        id="welcomeToYourHome"
        color="grey"
        title="Welcome to your home"
        description="Your area to see any proposals, member requests, editor requests and all general activity across the spaces you are involved in."
        media={<img src="/home.png" alt="" className="-mb-12" />}
      />
      {/* <Notice
          id="findOrCreateCompanySpace"
          color="green"
          title="Find / create your company space"
          description="Join your company space as a member or editor, or create it if it doesn’t exist."
          element={<FindOrCreateCompanySpace />}
          media={<img src="/company.png" alt="" className="-mb-12" />}
        /> */}
      <Notice
        id="findSpacesToJoin"
        color="orange"
        title="Find spaces to join"
        description="Discover and join spaces where you can actively engagte with the topics and issues that captivate your interest."
        element={<JoinSpaces />}
      />
      {/* <Notice
          id="learnMore"
          color="purple"
          title="Want to learn more?"
          description="Watch videos and read our guides to help you get to grips with the fundamentals of using and contributing to Geo."
          element={<LearnMore />}
          media={<img src="/videos.png" alt="" />}
        /> */}
    </div>
  );
};

type NoticeProps = {
  id: string;
  color: 'grey' | 'blue' | 'green' | 'orange' | 'purple';
  title: string;
  description: string;
  element?: React.ReactNode;
  media?: React.ReactNode;
};

const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

const Notice = ({ id, color, title, description, element, media }: NoticeProps) => {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const classNames = cva('relative flex gap-4 overflow-clip rounded-lg p-4', {
    variants: {
      color: {
        grey: 'bg-gradient-grey',
        blue: 'bg-gradient-blue',
        green: 'bg-gradient-green',
        orange: 'bg-gradient-orange',
        purple: 'bg-gradient-purple',
      },
    },
  });

  const handleDismissNotice = useCallback(() => {
    const newDismissedNotices = [...dismissedNotices, id];
    setDismissedNotices(newDismissedNotices);
  }, [id, dismissedNotices, setDismissedNotices]);

  if (dismissedNotices.includes(id)) return null;

  return (
    <div id={id} className={classNames({ color })}>
      <div>
        <div className="text-smallTitle">{title}</div>
        <div className="mt-2">{description}</div>
        {element && <div className="mt-2">{element}</div>}
      </div>
      {media && <div className="-mx-4 -mb-4">{media}</div>}
      <div>
        <button onClick={handleDismissNotice} className="rounded border p-1">
          <Close />
        </button>
      </div>
    </div>
  );
};

type SidebarProps = {
  acceptedProposalsCount: number;
};

const Sidebar = ({ acceptedProposalsCount }: SidebarProps) => {
  return (
    <div className="space-y-2">
      <Activity
        label="My proposals"
        activities={[
          { icon: <InProgressSmall />, label: 'In progress', count: 0 },
          { icon: <CheckCircleSmall />, label: 'Accepted', count: acceptedProposalsCount },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: 0 },
        ]}
      />
      <Activity
        label="Proposals I’ve voted on"
        activities={[
          { icon: <CheckCircleSmall />, label: 'Accepted', count: 0 },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: 0 },
        ]}
      />
      <Activity
        label="I have accepted"
        activities={[
          { icon: <Member />, label: 'Members', count: 0 },
          { icon: <EditSmall />, label: 'Editors', count: 0 },
        ]}
      />
    </div>
  );
};

type ActivityProps = {
  label: string;
  activities: { icon?: React.ReactNode; label: string; count: number }[];
};

function Activity({ label = '', activities = [] }: ActivityProps) {
  return (
    <div className="rounded-lg border border-grey-02 p-4">
      <div className="text-breadcrumb text-grey-04">{label}</div>
      {activities.map(({ icon, label, count }) => (
        <div key={label} className="mt-2 flex items-center justify-between text-metadataMedium">
          <div className="inline-flex items-center gap-2">
            {icon && <div>{icon}</div>}
            <div>{label}</div>
          </div>
          <div>{count}</div>
        </div>
      ))}
    </div>
  );
}

const FindOrCreateCompanySpace = () => {
  return (
    <div className="w-full rounded bg-white p-2 focus-within:ring-2 focus-within:ring-black">
      <input type="text" placeholder="Find or create..." className="w-full focus:outline-none" />
    </div>
  );
};

const recommendedSpaces: Array<`0x${string}`> = [
  '0x6144659cc8FCcBb7Bb41c94Fc8429Aec201A3ff5', // AI
  '0xC3819cbe5e3A2afe1884F0Ef97949bC989387061', // News
  '0xe3d08763498e3247EC00A481F199B018f2148723', // Health
  '0x1A39E2Fe299Ef8f855ce43abF7AC85D6e69E05F5', // Crypto
  '0x41155BC2156119e71d283237D299FC1a648602C2', // US Politics
  '0x44a6e58B483d4c569bAaB9DD1FC7fA445C1f1Ea9', // History
  '0xD8Ad7433f795fC19899f6b62a9b9831090495CAF', // Music
  '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16', // Philosophy
  '0x35D15c85AF6A00aBdc3AbFa4178C719e0220838e', // Sustainability
  '0x62b5b813B74C4166DA4f3f88Af6E8E4e657a9458', // Energy
  '0xC46a79dD4Cf9635011ba3A68Fb3CE6b6f8008cC0', // Social Work
  '0xD5445416E19Cc19451b3eBF3C31c434664Ad4310', // Software
];

const JoinSpaces = () => {
  const { spaces } = useSpaces();

  return (
    <div className="flex flex-wrap gap-2 pr-16">
      {recommendedSpaces.map(spaceId => {
        const space = spaces.find(space => space.id === spaceId);

        if (!space) return null;

        const spaceImage = space.spaceConfig?.image ? getImagePath(space.spaceConfig?.image) : PLACEHOLDER_SPACE_IMAGE;

        return (
          <Link
            key={space.id}
            href={NavUtils.toSpace(space.id)}
            className="inline-flex items-center gap-1.5 rounded bg-white p-1 text-breadcrumb"
          >
            <span className="relative h-3 w-3 overflow-hidden rounded-sm">
              <img src={spaceImage} className="absolute inset-0 h-full w-full object-cover object-center" alt="" />
            </span>
            <span>{space.spaceConfig?.name ?? space.id}</span>
          </Link>
        );
      })}
    </div>
  );
};

const topics: { icon?: React.ReactNode; label: string; href: string }[] = [
  { icon: <VideoSmall />, label: 'Videos', href: '/' },
  { icon: <InfoSmall />, label: 'Guides and posts', href: '/' },
];

const LearnMore = () => {
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map(topic => (
        <Link
          href={topic.href}
          key={topic.label}
          className="inline-flex items-center gap-1 rounded bg-white p-1 text-breadcrumb"
        >
          {topic.icon && <span className="inline-block scale-[0.75]">{topic.icon}</span>}
          <span>{topic.label}</span>
        </Link>
      ))}
    </div>
  );
};
