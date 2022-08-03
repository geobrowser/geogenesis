import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
// This can come through context or something dependency injected as well
import { useMachine } from '@xstate/react'
import { assign, createMachine } from 'xstate'
import { contentService } from '~/modules/editor/content'

interface PublishContext {
  count: number
}

const publishMachine = createMachine<PublishContext>({
  id: 'publish',
  initial: 'idle',
  context: {
    count: 0,
  },
  states: {
    idle: {
      on: { PUBLISH: 'uploading' },
    },
    uploading: {},
    minting: {},
    error: {},
    active: {
      entry: assign({ count: (ctx) => ctx.count + 1 }),
      on: { TOGGLE: 'idle' },
    },
  },
})

export function PublishButton() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  // TODO: xstate or something to manage publish effect and state
  // @ts-expect-error signer type mismatch
  const onPublish = () => contentService.publish(signer, chain)

  const [current, send] = useMachine(publishMachine)
  const uploading = current.matches('uploading')
  const { count } = current.context

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className="rounded-xl px-4 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      Publish
    </motion.button>
  )
}
