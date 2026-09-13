/**
 * Routing.
 *
 * Two areas: the public pages at the root, and the dashboard under /app inside
 * the AppShell. The review pages are lazy-loaded because they pull in the diff
 * viewer and the chart library, which the landing page has no use for.
 */

import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/hooks/useToast'
import { PageSkeleton } from '@/components/ui/States'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'

const PullRequests = lazy(() => import('@/pages/PullRequests'))
const PullRequestReview = lazy(() => import('@/pages/PullRequestReview'))
const ReviewReport = lazy(() => import('@/pages/ReviewReport'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Repositories = lazy(() => import('@/pages/Repositories'))
const Settings = lazy(() => import('@/pages/Settings'))
const Documentation = lazy(() => import('@/pages/Documentation'))
const NotFound = lazy(() => import('@/pages/NotFound'))

/** Send the viewport back to the top when the route changes. */
function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/docs" element={<Documentation />} />

            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="pull-requests" element={<PullRequests />} />
              <Route path="pull-requests/:id" element={<PullRequestReview />} />
              <Route path="pull-requests/:id/report" element={<ReviewReport />} />
              <Route path="repositories" element={<Repositories />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="docs" element={<Documentation embedded />} />
            </Route>

            {/* The old flat paths some links still use. */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  )
}

function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-[112rem] px-4 py-9 lg:px-8">
      <PageSkeleton />
    </div>
  )
}
