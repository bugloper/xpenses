import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * In development Vite serves no service worker (devOptions is off), so
 * registering would fetch index.html as a script. Worse, a production worker
 * left behind on the same origin (e.g. from `vite preview`) would keep serving
 * stale precached assets. Dev therefore unregisters everything instead.
 */
export function PwaUpdatePrompt() {
  if (import.meta.env.DEV) return <DevServiceWorkerCleanup />
  return <ProdUpdatePrompt />
}

function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => void r.unregister())
    })
    if (typeof caches !== 'undefined') {
      void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)))
    }
  }, [])
  return null
}

function ProdUpdatePrompt() {
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
