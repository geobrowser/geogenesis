import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
// This can come through context or something dependency injected as well
import { useMachine } from '@xstate/react'
import { assign, createMachine, interpret } from 'xstate'
import { contentService } from '~/modules/editor/content'

type Events = { type: 'UPLOAD' } | { type: 'MINT' } | { type: 'DONE' }
type States =
  | ({ value: 'idle' } | { value: 'uploading' } | { value: 'minting' }) & {
      context: Context
    }
type Context = {
  cid: string
  tokenId: string
}

const publishMachine = createMachine<Context, Events, States>({
  id: 'publish',
  initial: 'idle',
  context: {
    cid: '',
    tokenId: '',
  },
  states: {
    idle: {
      on: { UPLOAD: 'uploading' },
    },
    uploading: {
      on: { MINT: 'minting' },
    },
    minting: {
      on: { DONE: 'idle' },
    },
    done: {},
    error: {},
  },
})

const service = interpret(publishMachine).start()

export function PublishButton() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()
  const [current, send] = useMachine(publishMachine)

  // TODO: xstate or something to manage publish effect and state
  // @ts-expect-error signer type mismatch
  const onPublish = () => contentService.publish(signer, chain, send)

  console.log(current.value)

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className="rounded-xl px-4 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      {current.matches('idle') && 'Publish'}
      {current.matches('uploading') && 'Uploading...'}
      {current.matches('minting') && 'Minting...'}
    </motion.button>
  )
}
