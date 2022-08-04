import { publishService } from '~/modules/api/publish-service'
import { Editor as BaseEditor } from '~/modules/editor/editor'

export function Editor() {
  return (
    <div className="rounded-xl px-10 py-6">
      <BaseEditor publishService={publishService} />
    </div>
  )
}
