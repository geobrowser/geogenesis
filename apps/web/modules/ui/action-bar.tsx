import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { getBaseUrl } from '../utils/get-base-url'
import { Animate } from './animate'
import { Heart } from './icons/heart'
import { Share } from './icons/share'
import { PublishButton } from './publish-button'

interface Props {
  backgroundColor: string
}

export function ActionBar({ backgroundColor }: Props) {
  const { isConnected } = useAccount()
  const router = useRouter()
  const isNewRoute = router.pathname === '/new'
  const isPageRoute = router.pathname === '/page/[id]'
  const isEditRoute = router.pathname === '/page/[id]/edit'

  // TODO: Pass "action element group" to Navbar so different route context can inject
  // the elements they want to render in the navbar.
  return (
    <motion.div
      initial={{ backgroundColor: '#ffffff' }}
      animate={{ backgroundColor }}
      className="action-bar"
    >
      {/* TODO: Byron fix this HACK */}
      <div />
      <AnimatePresence exitBeforeEnter>
        <div className="flex justify-center items-center">
          <AnimatePresence exitBeforeEnter>
            {isConnected && (
              <>
                {isNewRoute && (
                  <Animate animation="fade" className="flex" delay={0.5}>
                    <PublishButton key="publish-button" />
                    <hr className="w-8 border-none" />
                  </Animate>
                )}
                {isPageRoute && (
                  <LayoutGroup>
                    <div className="flex items-center space-x-6">
                      <Animate animation="fade" className="flex" delay={0.75}>
                        <ShareButton />
                      </Animate>
                      <Animate animation="fade" className="flex" delay={0.65}>
                        <SaveButton />
                      </Animate>
                      <Animate animation="fade" className="flex" delay={0.5}>
                        <button
                          key="edit-button"
                          className="flex items-center space-x-2 font-bold rounded-3xl bg-geo-grey-4 px-4 py-2"
                          onClick={() => {
                            router.push(router.asPath + '/edit')
                          }}
                        >
                          Edit
                        </button>
                      </Animate>
                    </div>
                    <hr className="w-8 border-none" />
                  </LayoutGroup>
                )}
                {isEditRoute && (
                  <Animate animation="fade" className="flex" delay={0.5}>
                    <PublishButton key="publish-button" />
                    <hr className="w-8 border-none" />
                  </Animate>
                )}
              </>
            )}
          </AnimatePresence>
          <ConnectButton
            label="Sign in"
            chainStatus="none"
            showBalance={false}
          />
        </div>
      </AnimatePresence>
    </motion.div>
  )
}

function SaveButton() {
  const [isHovered, setHovered] = useState(false)

  // TODO: This is a stateful HACK to demo the "active" state.
  const [isActive, setActive] = useState(false)

  return (
    <motion.button
      layout="position"
      key="save-button"
      className="flex items-center space-x-2 font-bold"
      onClick={() => {
        setActive((prev) => !prev)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.05 }}
    >
      <LayoutGroup>
        <motion.div layout="position">
          <Heart isActive={isActive} isHovered={isHovered} />
        </motion.div>
        <p>{isActive ? 'Saved' : 'Save'}</p>
      </LayoutGroup>
    </motion.button>
  )
}

function ShareButton() {
  const router = useRouter()
  const [isHovered, setHovered] = useState(false)

  // TODO: This is a stateful HACK to demo the "active" state.
  const [isActive, setActive] = useState(false)

  function copyUrlToClipboard() {
    const url = `${getBaseUrl()}${router.asPath}`
    navigator.clipboard.writeText(url)
  }

  return (
    <motion.button
      layout="position"
      key="share-button"
      className="flex items-center space-x-2 font-bold"
      onClick={() => {
        copyUrlToClipboard()
        setActive((prev) => !prev)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.05 }}
    >
      <LayoutGroup>
        <motion.div layout="position">
          <Share isActive={isActive} isHovered={isHovered} />
        </motion.div>
        <p>{isActive ? 'Copied' : 'Share'}</p>
      </LayoutGroup>
    </motion.button>
  )
}
