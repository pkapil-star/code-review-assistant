import { Compass } from 'lucide-react'
import { PublicFooter, PublicNav } from '@/components/marketing/PublicChrome'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { Panel } from '@/components/ui/Card'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav />

      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16 lg:px-8">
        <Panel className="w-full">
          <EmptyState
            icon={Compass}
            title="That page does not exist"
            description="The link may be out of date, or the pull request it pointed at is no longer in the review store."
            action={
              <>
                <ButtonLink to="/app" variant="primary">
                  Go to the dashboard
                </ButtonLink>
                <ButtonLink to="/docs">Read the documentation</ButtonLink>
              </>
            }
          />
        </Panel>
      </main>

      <PublicFooter />
    </div>
  )
}
