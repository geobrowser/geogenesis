import Link from 'next/link'
import { Avatar } from './icons/avatar'
import { Editor } from './icons/editor'
import { GeoLarge } from './icons/geo-large'
import { GeoSmall } from './icons/geo-small'
import { Stack } from './icons/stack'

export function Navbar() {
  return (
    // Stacking context needs to be higher than the action bar
    <nav className="bg-geo-white-100 shadow-lg absolute left-0 h-screen w-24 z-20 flex flex-col items-center justify-between">
      <GeoLarge />
      <div className="flex flex-col items-center">
        <Link href="/new">
          <a>
            <Editor />
          </a>
        </Link>
        <Link href="/token/3">
          <a>
            <Stack />
          </a>
        </Link>
        <GeoSmall />
        <Avatar />
        {/* <Star /> */}
      </div>

      {/* TODO: Byron fix position HACK */}
      <div />
    </nav>
  )
}
