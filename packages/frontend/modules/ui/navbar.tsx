import Link from 'next/link'
import { useRouter } from 'next/router'
import { Avatar } from './icons/avatar'
import { EditorActive } from './icons/editor-active'
import { Geo } from './icons/geo'
import { GeoLarge } from './icons/geo-large'
import { Stack } from './icons/stack'

export function Navbar() {
  const router = useRouter()

  return (
    // Stacking context needs to be higher than the action bar
    <nav className="bg-geo-white-100 shadow-lg sticky h-screen top-0 w-24 z-20 flex flex-col items-center justify-between">
      <Link href="/">
        <a>
          <GeoLarge />
        </a>
      </Link>
      <div className="flex flex-col items-center space-y-2">
        <Link href="/">
          <a>
            <Geo isActive={router.pathname === '/'} />
          </a>
        </Link>
        <Link href="/new">
          <a>
            <EditorActive isActive={router.pathname === '/new'} />
          </a>
        </Link>
        <Stack isActive={router.pathname === '/proposals'} />
        <Avatar />
        {/* <Star /> */}
      </div>

      {/* TODO: Byron fix position HACK */}
      <div />
    </nav>
  )
}
