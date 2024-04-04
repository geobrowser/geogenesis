'use client';

import { cva } from 'class-variance-authority';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Link from 'next/link';

import * as React from 'react';
import { useCallback, useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpaces } from '~/core/hooks/use-spaces';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { EditSmall } from '~/design-system/icons/edit-small';
import { InProgressSmall } from '~/design-system/icons/in-progress-small';
import { InfoSmall } from '~/design-system/icons/info-small';
import { Member } from '~/design-system/icons/member';
import { Tick } from '~/design-system/icons/tick';
import { Time } from '~/design-system/icons/time';
import { VideoSmall } from '~/design-system/icons/video-small';
import { Menu } from '~/design-system/menu';
import { TabGroup } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import {
  ActiveProposalsForSpacesWhereEditor,
  getActiveProposalsForSpacesWhereEditor,
} from './fetch-active-proposals-in-editor-spaces';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  header: React.ReactNode;
  activeProposals: ActiveProposalsForSpacesWhereEditor;
  acceptedProposalsCount: number;
};

export const Component = ({ header, activeProposals, acceptedProposalsCount }: Props) => {
  return (
    <>
      <div className="mx-auto max-w-[784px]">
        {header}
        <PersonalHomeNavigation />
        <PersonalHomeDashboard activeProposals={activeProposals} acceptedProposalsCount={acceptedProposalsCount} />
      </div>
    </>
  );
};

const PersonalHomeNavigation = () => {
  return (
    <TabGroup
      tabs={TABS.map(label => {
        const href = label === 'For You' ? `/home` : `/home/${label.toLowerCase()}`;
        const disabled = label === 'For You' ? false : true;

        return {
          href,
          label,
          disabled,
        };
      })}
      className="mt-8"
    />
  );
};

type PersonalHomeView = 'all' | 'requests' | 'proposals';

const viewLabel: Record<PersonalHomeView, string> = {
  all: 'All',
  proposals: 'Active Proposals',
  requests: 'Membership Requests',
};

type PersonalHomeDashboardProps = {
  activeProposals: ActiveProposalsForSpacesWhereEditor;
  acceptedProposalsCount: number;
};

const personalHomeViewAtom = atomWithStorage<PersonalHomeView>('personalHomeView', 'all');

const PersonalHomeDashboard = ({ activeProposals, acceptedProposalsCount }: PersonalHomeDashboardProps) => {
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
          {!hasNoActivity && (
            <>{personalHomeView === 'proposals' && <PendingProposals activeProposals={activeProposals} />}</>
          )}
        </div>
        <div className="w-1/3">
          <Sidebar acceptedProposalsCount={acceptedProposalsCount} />
        </div>
      </div>
    </>
  );
};

const NoActivity = () => {
  return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
};

type PendingProposalsProps = {
  activeProposals: ActiveProposalsForSpacesWhereEditor;
};

const PendingProposals = ({ activeProposals }: PendingProposalsProps) => {
  if (activeProposals.proposals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {activeProposals.proposals.map(proposal => (
        <PendingProposal key={proposal.id} proposal={proposal} />
      ))}
    </div>
  );
};

type PendingProposalProps = {
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number];
};

const PendingProposal = ({ proposal }: PendingProposalProps) => {
  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <button>
        <div className="text-smallTitle">Changes to x, y, and z across several pages</div>
      </button>
      <Link href="" className="flex items-center gap-1.5 text-breadcrumb text-grey-04">
        <div className="inline-flex items-center gap-3 text-breadcrumb text-grey-04">
          <Link href={''} className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={''} value={''} />
            </div>
            <p>Anonymous</p>
          </Link>
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <img src="/mosaic.png" alt="" className="h-full w-full object-cover" />
            </div>
            <p>Space</p>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex gap-1.5 rounded bg-grey-01 px-1.5 py-1 text-breadcrumb text-xs leading-none">
            <Time />
            <span>6h 30m remaining</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-2">
          <SmallButton onClick={() => null}>Reject</SmallButton>
          <SmallButton onClick={() => null}>Accept</SmallButton>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Tick />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: '75%' }} />
          </div>
          <div>75%</div>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Close />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: '25%' }} />
          </div>
          <div>25%</div>
        </div>
      </div>
    </div>
  );
};

// type PendingRequestsProps = {
//   membershipRequests: MembershipRequestWithProfile[];
// };

// const dismissedRequestsAtom = atomWithStorage<Array<string>>('dismissedRequests', []);

// const PendingRequests = ({ membershipRequests }: PendingRequestsProps) => {
//   const [dismissedRequests, setDismissedRequests] = useAtom(dismissedRequestsAtom);

//   if (membershipRequests.length === 0) {
//     return null;
//   }

//   const dismissedSet = new Set(dismissedRequests);

//   const onRequestProcessed = (requestId: string) => {
//     if (!dismissedSet.has(requestId)) {
//       const newDismissedRequests = [...dismissedRequests, requestId];
//       setDismissedRequests(newDismissedRequests);
//     }
//   };

//   return (
//     <div className="space-y-2">
//       {membershipRequests
//         .filter(r => !dismissedSet.has(r.id))
//         .map(request => (
//           <MembershipRequest key={request.id} request={request} onRequestProcessed={onRequestProcessed} />
//         ))}
//     </div>
//   );
// };

// type MembershipRequestProps = {
//   request: MembershipRequestWithProfile;
//   onRequestProcessed: (requestId: string) => void;
// };

// const MembershipRequest = ({ request, onRequestProcessed }: MembershipRequestProps) => {
//   const profile = request.requestor;

//   const { data: wallet } = useWalletClient();

//   const handleAccept = async () => {
//     if (wallet && request.space && profile.id) {
//       const roleToChange = await Publish.getRole(request.space.id, 'EDITOR_ROLE');
//       await Publish.grantRole({ spaceId: request.space.id, role: roleToChange, wallet, userAddress: profile.address });
//       onRequestProcessed(request.id);
//     }
//   };

//   const handleReject = () => {
//     onRequestProcessed(request.id);
//   };

//   return (
//     <ClientOnly>
//       <div className="space-y-4 rounded-lg border border-grey-02 p-4">
//         <Link href={profile?.profileLink ?? ''} className="flex items-center justify-between">
//           <div className="text-smallTitle">{profile?.name ?? profile.id}</div>
//           <div className="relative h-5 w-5 overflow-hidden rounded-full">
//             <Avatar value={profile.address} avatarUrl={profile?.avatarUrl} size={20} />
//           </div>
//         </Link>
//         <Link
//           href={NavUtils.toSpace(request.space.id)}
//           className="flex items-center gap-1.5 text-breadcrumb text-grey-04"
//         >
//           <span className="relative h-3 w-3 overflow-hidden rounded-sm">
//             <img
//               src={request.space.image ? getImagePath(request.space.image) : undefined}
//               className="absolute inset-0 h-full w-full object-cover object-center"
//               alt=""
//             />
//           </span>
//           <span>{request.space.name ?? 'Space'}</span>
//         </Link>
//         <div className="flex items-center justify-between">
//           <div>
//             <div className="gap-1.5 rounded bg-grey-01 px-1.5 py-1 text-breadcrumb text-xs leading-none">
//               Member request 0/1 votes needed
//             </div>
//           </div>
//           <div className="inline-flex items-center gap-2">
//             <SmallButton onClick={handleReject}>Reject</SmallButton>
//             <SmallButton onClick={handleAccept}>Accept</SmallButton>
//           </div>
//         </div>
//       </div>
//     </ClientOnly>
//   );
// };

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

const Notices = () => {
  return (
    <div className="mb-2 space-y-2">
      <ClientOnly>
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
      </ClientOnly>
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

const Activity = ({ label = '', activities = [] }: ActivityProps) => {
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
};
