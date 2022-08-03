import { contentService } from '~/modules/editor/content'
import { Editor as BaseEditor } from '~/modules/editor/editor'

export function Editor() {
  return (
    <div className="rounded-xl px-10 py-6 bg-stone-50 shadow-lg">
      <div className="flex justify-between border-b border-stone-100 pb-6">
        <h2 className="text-blue-600 font-bold">thegreenalien.eth</h2>
      </div>
      <BaseEditor contentService={contentService} />
    </div>
  )
}
