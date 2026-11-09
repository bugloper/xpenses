import { CalendarClock } from 'lucide-react'
import { accessDaysLeft, useAuth } from '@/lib/auth'
import { formatShortDate } from '@/lib/dates'

/** A reminder during the last month of a user's free year. Admins never see it. */
export function AccessBanner() {
  const { user } = useAuth()
  if (!user) return null
  const left = accessDaysLeft(user)
  if (left === null || left > 30 || left < 0) return null
  const when =
    left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days (${formatShortDate(user.access_until)})`
  return (
    <div
      role="status"
      className="bg-warn/10 border-warn flex items-start gap-2.5 rounded-md border-l-[3px] px-3.5 py-2.5 text-sm"
    >
      <CalendarClock className="text-warn mt-0.5 size-4 shrink-0" />
      <span>
        Your free year ends {when}. Ask the administrator to extend your access so you can keep recording.
      </span>
    </div>
  )
}
