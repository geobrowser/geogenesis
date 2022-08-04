import { AnimatePresence, motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { PublishState, usePublishService } from '~/modules/api/publish-service'
import { useRouter } from 'next/router'
import { observer } from 'mobx-react-lite'
import { PuffLoader } from 'react-spinners'
import * as Popover from '@radix-ui/react-popover'
import { Animate } from './animate'

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
    <Popover.Root open={isPublishing}>
      <Popover.Trigger className="flex justify-center" asChild>
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          className={`rounded-xl w-20 py-2 bg-blue-700 text-slate-100 font-bold shadow-lg flex justify-center items-center ${
            isPublishing && 'cursor-not-allowed'
          }`}
          onClick={!isPublishing ? onPublish : undefined}
        >
          <AnimatePresence exitBeforeEnter>
            {!isPublishing ? (
              <Animate key="Publish text" animation="fade">
                <p>Publish</p>
              </Animate>
            ) : (
              <Animate key="Loading spinner" animation="fade">
                <PuffLoader size={24} color="#ffffff" />
              </Animate>
            )}
          </AnimatePresence>
        </motion.button>
      </Popover.Trigger>

      <Popover.Content sideOffset={12}>
        <Popover.Arrow width={20} height={8} className="fill-stone-50" />
        <Tooltip publishState={publishService.publishState} />
      </Popover.Content>
    </Popover.Root>
  )
})

interface TooltipProps {
  publishState: PublishState
}

function Tooltip({ publishState }: TooltipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="p-5 w-80 bg-slate-50 shadow-lg rounded-lg overflow-hidden z-10"
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
  )
}
