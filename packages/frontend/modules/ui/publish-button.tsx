import { AnimatePresence, motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { PublishState, usePublishService } from '~/modules/api/publish-service'
import { useRouter } from 'next/router'
import { observer } from 'mobx-react-lite'
import { PuffLoader } from 'react-spinners'

export const PublishButton = observer(() => {
  const router = useRouter()
  const { chain } = useNetwork()
  const { data: signer } = useSigner()
  const publishService = usePublishService()

  const onPublish = async () => {
    // @ts-expect-error type mismatch for signer
    const tokenId = await publishService.publish(signer, chain)
    router.replace(`/token/${tokenId}`)
  }

  const isPublishing = publishService.publishState !== 'idle'

  return (
    <div className="relative">
      <motion.button
        layout
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        disabled={isPublishing}
        className={`rounded-xl px-4 py-2 bg-blue-700 text-slate-100 font-bold shadow-lg flex items-center ${
          isPublishing && 'cursor-not-allowed'
        }`}
        onClick={!isPublishing ? onPublish : undefined}
      >
        {!isPublishing ? 'Publish' : <PuffLoader size={24} color="#ffffff" />}
      </motion.button>

      {isPublishing && <Tooltip publishState={publishService.publishState} />}
    </div>
  )
})

interface TooltipProps {
  publishState: PublishState
}

function Tooltip({ publishState }: TooltipProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, top: 0 }}
        animate={{ opacity: 1, top: 64 }}
        exit={{ opacity: 0, top: 0 }}
        className="publish-tooltip"
      >
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold mb-5"
        >
          Publishing your page
        </motion.h2>
        <AnimatePresence>
          {publishState === 'uploading' && (
            <>
              <motion.p
                key="Step 1"
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ delay: 0.1 }}
                className="text-blue-600 font-bold"
              >
                Step 1/2
              </motion.p>
              <motion.p
                key="Uploading"
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ delay: 0.15 }}
                className="text-stone-600"
              >
                Uploading page content to IPFS
              </motion.p>
            </>
          )}
          {publishState === 'minting' && (
            <>
              <motion.p
                key="Step 2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ delay: 0.1 }}
                className="text-blue-600 font-bold"
              >
                Step 2/2
              </motion.p>
              <motion.p
                key="Minting"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ delay: 0.15 }}
                className="text-stone-600"
              >
                Writing your page to the blockchain
              </motion.p>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
