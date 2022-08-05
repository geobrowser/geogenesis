import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { observer } from 'mobx-react-lite'
import { PuffLoader } from 'react-spinners'
import * as Popover from '@radix-ui/react-popover'
import { PublishState, usePublishService } from '~/modules/api/publish-service'
import { Animate } from './animate'
import { getBaseUrl } from '../utils/get-base-url'

export const PublishButton = observer(() => {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()
  const publishService = usePublishService()
  const [publishState, setPublishState] = useState<PublishState>('idle')
  const [tokenId, setTokenId] = useState('')

  const onPublish = async () => {
    // @ts-expect-error type mismatch for signer
    const tokenId = await publishService.publish(signer, chain, setPublishState)
    setTokenId(tokenId)
  }

  const isPublishing = publishState !== 'idle'

  return (
    <Popover.Root open={isPublishing}>
      <Popover.Trigger className="flex justify-center" asChild>
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          className={`rounded-xl w-20 py-2 bg-geo-blue-100 text-slate-100 font-bold shadow-lg flex justify-center items-center ${
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
        <Tooltip
          publishState={publishState}
          tokenUrl={`${getBaseUrl()}/token/${tokenId}`}
        />
      </Popover.Content>
    </Popover.Root>
  )
})

interface TooltipProps {
  publishState: PublishState
  tokenUrl: string
}

function Tooltip({ publishState, tokenUrl }: TooltipProps) {
  const [copyText, setIsCopied] = useState<'Share' | 'Copied!'>('Share')

  const copyTokenUrl = () => {
    navigator.clipboard.writeText(tokenUrl)
    setIsCopied('Copied!')
  }

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
        {publishState !== 'done' ? 'Publishing your page' : 'Page published!'}
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
              className="text-geo-blue-100 font-bold"
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
        {publishState === 'done' && (
          <div className="flex items-center space-x-4">
            <Link href={tokenUrl}>
              <motion.a
                key="done-view"
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ delay: 0.1 }}
                className="text-stone-600 rounded-3xl font-bold bg-gray-100 w-36 py-2 no-underline flex justify-center"
              >
                View
              </motion.a>
            </Link>
            <motion.button
              key="done-share"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -360 }}
              transition={{ delay: 0.15 }}
              className="text-stone-50 bg-geo-blue-100 font-bold rounded-3xl w-36 py-2"
              onClick={copyTokenUrl}
            >
              {copyText}
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
