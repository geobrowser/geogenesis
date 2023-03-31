import { SYSTEM_IDS } from '@geogenesis/ids';
import { A } from '@mobily/ts-belt';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { IconButton } from '~/modules/design-system/button';
import { ChevronRight } from '~/modules/design-system/icons/chevron-right';
import { Discord } from '~/modules/design-system/icons/discord';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Spacer } from '~/modules/design-system/spacer';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { usePageName } from '~/modules/stores/use-page-name';
import { ExternalLink } from '../external-link';
import { NavbarActions } from './navbar-actions';
import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();
  const { pageName } = usePageName();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  // @TODO: This is all super hacky, there should be a better way of doing this
  const activeBreadcrumb = A.last(components);
  const activeBreadcrumbName = activeBreadcrumb?.split('?')[0];

  const isHomePage = components.length === 2 && components[1] === 'spaces';
  const isSpacePage = components.length === 3 && components[1] === 'space';
  const isEntityPage = components.length === 4 && components[1] === 'space';

  const getActiveImage = () => {
    if (isHomePage) return '/spaces.png';
    if (isSpacePage) return spaceImages[activeBreadcrumbName ?? ''] ?? '';
    if (isEntityPage) return '/facts.svg';
    return '/spaces.png';
  };

  const getActiveName = () => {
    if (isHomePage) return 'Spaces';
    if (isSpacePage) return spaceNames[activeBreadcrumbName ?? ''] ?? '';
    if (isEntityPage) return pageName ?? '';
    return '';
  };

  return (
    <nav className="flex w-full items-center justify-between gap-1 border-b border-divider py-1 px-4 md:py-3 md:px-4">
      <div className="flex items-center gap-8 md:gap-4">
        <Link href="/" passHref>
          <a>
            <GeoLogoLarge />
          </a>
        </Link>
        {!isHomePage && (
          <div className="flex items-center gap-2">
            <NavbarLinkMenu />

            <ChevronRight color="grey-03" />

            {activeBreadcrumb && !isHomePage && (
              <NavbarBreadcrumb href={activeBreadcrumb} img={getActiveImage()}>
                {getActiveName().slice(0, 48) + (getActiveName().length > 48 ? '...' : '')}
              </NavbarBreadcrumb>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center sm:hidden">
        <IconButton onClick={onSearchClick} icon="search" />
        <Spacer width={16} />
        <DiscordLink />
        <Spacer width={16} />
        <NavbarActions spaceId={components?.[2]?.split('?')[0] ?? ''} />
      </div>
    </nav>
  );
}

function DiscordLink() {
  return (
    <ExternalLink href="https://discord.gg/axFtvyxRNQ">
      <div className="flex w-[105px] items-center text-button text-grey-04 transition-all duration-150 ease-in-out hover:text-text">
        <Discord />
        <Spacer width={8} />
        <p>Geo Discord</p>
      </div>
    </ExternalLink>
  );
}
