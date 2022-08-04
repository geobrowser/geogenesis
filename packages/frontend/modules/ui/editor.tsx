import { usePublishService } from '~/modules/api/publish-service'
import { Editor as BaseEditor } from '~/modules/editor/editor'

export function Editor() {
  const publishService = usePublishService()

  return (
    <div className="rounded-xl px-10 py-6">
      <BaseEditor publishService={publishService} />
    </div>
  )
}
