import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  installOffer,
  isIOS,
  markOfferShown,
  offerShownThisSession,
  promptInstall,
  readSnoozedUntil,
  snoozeInstallOffer,
  usePwaInstall,
} from '@/lib/pwa-install'

export const INSTALL_TOAST_ID = 'pwa-install-offer'
/** Short delay so the offer appears after the signed-in screen has settled. */
export const INSTALL_OFFER_DELAY_MS = 1500

/**
 * Snackbar shown once per session after sign-in inviting the user to install
 * Xpenses. Native install where the browser supports it; on iOS the
 * "Add to Home Screen" steps. Mounted in the signed-in shell only.
 */
export function PwaInstallPrompt() {
  const { canInstall, installed, standalone } = usePwaInstall()

  useEffect(() => {
    if (offerShownThisSession()) return
    const offer = installOffer({
      canInstall,
      installed,
      standalone,
      ios: isIOS(),
      snoozedUntil: readSnoozedUntil(),
      now: Date.now(),
    })
    if (!offer) return

    const timer = setTimeout(() => {
      markOfferShown()
      const snooze = () => snoozeInstallOffer()
      toast('Install Xpenses', {
        id: INSTALL_TOAST_ID,
        description:
          offer === 'native'
            ? 'Add it to your home screen for one-tap expense entry.'
            : 'Tap Share, then "Add to Home Screen" for one-tap expense entry.',
        duration: 12_000,
        action:
          offer === 'native'
            ? {
                label: 'Install',
                onClick: () => {
                  void promptInstall().then((r) => {
                    if (r === 'accepted') toast.success('Installed')
                    else snooze()
                  })
                },
              }
            : { label: 'Got it', onClick: snooze },
        cancel: { label: 'Not now', onClick: snooze },
        onDismiss: snooze,
        onAutoClose: snooze,
      })
    }, INSTALL_OFFER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canInstall, installed, standalone])

  return null
}
