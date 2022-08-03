import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
// This can come through context or something dependency injected as well
import { contentService } from '~/modules/editor/content'

export function PublishButton() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  // TODO: xstate or something to manage publish effect and state
  // @ts-expect-error signer type mismatch
  const onPublish = () => contentService.publish(signer, chain)

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className="rounded-2xl px-6 py-4 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      Publish
    </motion.button>
  )
}
