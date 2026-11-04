import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while the app stays open.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })
  useEffect(() => {
    if (!needRefresh) return
    const id = toast('New version available', {
      description: 'Reload to get the latest Xpensiv.',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
      cancel: { label: 'Later', onClick: () => setNeedRefresh(false) },
    })
    return () => {
      toast.dismiss(id)
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])
  return null
}
