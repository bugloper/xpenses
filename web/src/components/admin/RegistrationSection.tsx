import { toast } from 'sonner'
import { Panel } from '@/components/common/kit'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import { useAdminSettings, useUpdateAdminSettings } from '@/lib/queries/auth'
import { cn } from '@/lib/utils'

/** Whether anyone can sign up, or only people holding an invite link. */
export function RegistrationSection({ id, className }: { id?: string; className?: string }) {
  const { data, isPending, error, refetch } = useAdminSettings()
  const update = useUpdateAdminSettings()
  return (
    <Panel id={id} title="Registration" className={className} flush>
      {isPending ? (
        <div className="p-5">
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Sign-up is</div>
              <p
                className={cn(
                  'font-display mt-1.5 text-[1.75rem] leading-none',
                  data.registration_open ? 'text-income' : 'text-foreground',
                )}
              >
                {data.registration_open ? 'Open' : 'Invite only'}
              </p>
            </div>
            <Switch
              checked={data.registration_open}
              disabled={update.isPending}
              aria-label="Open registration"
              className="mt-1"
              onCheckedChange={(v) =>
                update.mutate(
                  { registration_open: v },
                  {
                    onSuccess: (s) =>
                      toast.success(s.registration_open ? 'Registration opened' : 'Registration closed'),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            />
          </div>
          <p className="text-muted-foreground border-t pt-3 text-sm">
            {data.registration_open
              ? 'Anyone who can reach this server can create an account.'
              : 'New accounts need an invite link.'}{' '}
            Every new user gets a free year from the day they sign up.
          </p>
        </div>
      )}
    </Panel>
  )
}
