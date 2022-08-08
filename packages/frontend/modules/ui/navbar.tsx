import { Avatar } from './icons/avatar'
import { Editor } from './icons/editor'
import { GeoSmall } from './icons/geo-small'
import { Stack } from './icons/stack'
import { Star } from './icons/star'

export function Navbar() {
  return (
    // Stacking context needs to be higher than the action bar
    <nav className="bg-geo-white-100 shadow-lg absolute left-0 h-screen w-24 z-20 flex flex-col items-center justify-center">
      {/* <h2>Logo</h2> */}
      <div className="flex flex-col items-center">
        <Editor />
        <Stack />
        <GeoSmall />
        <Avatar />
        <Star />
      </div>
    </nav>
  )
}
