import { createRoute, redirect } from '@tanstack/react-router'
import { InvitesSection } from '@/components/admin/InvitesSection'
import { RegistrationSection } from '@/components/admin/RegistrationSection'
import { UsersSection } from '@/components/admin/UsersSection'
import { PageHeader, Section } from '@/components/common/PageHeader'
import { appRoute } from './__root'

function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Admin" description="Users, registration and invites for this instance." />
      <Section title="Users">
        <UsersSection />
      </Section>
      <Section title="Registration">
        <RegistrationSection />
      </Section>
      <Section title="Invites">
        <InvitesSection />
      </Section>
    </div>
  )
}

export const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  // The root guard already redirects non-admins; this keeps the rule local too.
  beforeLoad: ({ context }) => {
    if (context.auth.user?.role !== 'admin') throw redirect({ to: '/' })
  },
  component: AdminPage,
})
