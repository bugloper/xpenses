import { toast } from 'sonner'
import { ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import { useAdminSettings, useUpdateAdminSettings } from '@/lib/queries/auth'

export function RegistrationSection() {
  const { data, isPending, error, refetch } = useAdminSettings()
  const update = useUpdateAdminSettings()
  if (isPending) return <Skeleton className="h-16 w-full rounded-2xl" />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  return (
    <div className="bg-card ring-foreground/10 flex items-center justify-between gap-4 rounded-2xl p-4 ring-1">
      <div>
        <p className="text-sm font-medium">Open registration</p>
        <p className="text-muted-foreground text-xs">
          {data.registration_open
            ? 'Anyone who can reach this server can create an account.'
            : 'New accounts need an invite link.'}
        </p>
      </div>
      <Switch
        checked={data.registration_open}
        disabled={update.isPending}
        aria-label="Open registration"
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
  )
}
