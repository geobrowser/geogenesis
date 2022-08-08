import Link from 'next/link'
import { useRouter } from 'next/router'
import { Avatar } from './icons/avatar'
import { EditorActive } from './icons/editor-active'
import { GeoInactive } from './icons/geo-inactive'
import { GeoLarge } from './icons/geo-large'
import { Stack } from './icons/stack'

export function Navbar() {
  const router = useRouter()

  return (
    // Stacking context needs to be higher than the action bar
    <nav className="bg-geo-white-100 shadow-lg absolute left-0 h-screen w-24 z-20 flex flex-col items-center justify-between">
      <GeoLarge />
      <div className="flex flex-col items-center space-y-2">
        <Link href="/new">
          <a>
            <EditorActive isActive={router.pathname === '/new'} />
          </a>
        </Link>
        <Link href="/page/3">
          <a>
            <Stack isActive={router.pathname === '/page/[id]'} />
          </a>
        </Link>
        <GeoInactive />
        <Avatar />
        {/* <Star /> */}
      </div>

      {/* TODO: Byron fix position HACK */}
      <div />
    </nav>
  )
}
