import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { useMachine } from '@xstate/react'
// This can come through context or something dependency injected as well
import { contentService, publishMachine } from '~/modules/editor/content'
import { useRouter } from 'next/router'

export function PublishButton() {
  const router = useRouter()
  const { chain } = useNetwork()
  const { data: signer } = useSigner()
  const [current, send] = useMachine(publishMachine)

  const onPublish = async () => {
    // @ts-expect-error signer type mismatch
    const tokenId = await contentService.publish(signer, chain, send)
    router.replace(`/token/${tokenId}`)
  }

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
