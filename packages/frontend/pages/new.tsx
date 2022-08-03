import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Animate } from '~/modules/ui/animate'
import { Editor } from '~/modules/ui/editor'

export default function New() {
  // TODO: Abstract guarded routes
  const { isConnected } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  return (
    <Animate key="Sign out" animation="fade">
      <Editor />
    </Animate>
  )
}
