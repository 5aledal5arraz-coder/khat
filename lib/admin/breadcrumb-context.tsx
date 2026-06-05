"use client"

/**
 * Breadcrumb label override context.
 *
 * The shared `<Breadcrumbs />` component renders purely from the URL
 * pathname. That works for static segments (we have a label map for
 * "seasons", "new", etc.) but breaks for dynamic segments — e.g.
 * `/admin/khat-brain/seasons/<uuid>` shouldn't render a raw UUID.
 *
 * Pages with dynamic segments call `useSetBreadcrumbLabel(pathname, label)`
 * to register their human-readable Arabic label against their full path.
 * The breadcrumbs component reads the registry when it walks the URL.
 *
 * Registration is keyed by the full path (not just the last segment)
 * so sibling pages with the same id segment don't collide.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type LabelMap = Record<string, string>

interface BreadcrumbLabelContextValue {
  labels: LabelMap
  register: (path: string, label: string) => void
  unregister: (path: string) => void
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue | null>(
  null,
)

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<LabelMap>({})

  const register = useCallback((path: string, label: string) => {
    setLabels((prev) => {
      if (prev[path] === label) return prev
      return { ...prev, [path]: label }
    })
  }, [])

  const unregister = useCallback((path: string) => {
    setLabels((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ labels, register, unregister }),
    [labels, register, unregister],
  )

  return (
    <BreadcrumbLabelContext.Provider value={value}>
      {children}
    </BreadcrumbLabelContext.Provider>
  )
}

/**
 * Read-only hook used by the breadcrumb component itself.
 */
export function useBreadcrumbLabels(): LabelMap {
  const ctx = useContext(BreadcrumbLabelContext)
  return ctx?.labels ?? {}
}

/**
 * Page-side hook. Call this from any page that has a dynamic URL segment
 * you want rendered as a human-readable Arabic label. The hook auto-
 * unregisters when the component unmounts.
 *
 *   useSetBreadcrumbLabel(`/admin/khat-brain/seasons/${season.id}`, season.name)
 *
 * Implementation detail: depend on the stable `register` / `unregister`
 * callbacks — NOT on the full context object. The context value changes
 * every time `labels` changes (it's a new object), so depending on `ctx`
 * would trigger cleanup → register → re-render → cleanup → register …
 * and trip React's "Maximum update depth" guard. `register` + `unregister`
 * are `useCallback([])` so they're stable across renders.
 */
export function useSetBreadcrumbLabel(path: string, label: string | null | undefined) {
  const ctx = useContext(BreadcrumbLabelContext)
  const register = ctx?.register
  const unregister = ctx?.unregister
  useEffect(() => {
    if (!register || !unregister) return
    if (!path) return
    if (!label) return
    register(path, label)
    return () => {
      unregister(path)
    }
  }, [register, unregister, path, label])
}

/**
 * Tiny client-only helper so server pages can register a breadcrumb
 * label without spawning a full custom component per route:
 *
 *   // In the server page:
 *   <SetBreadcrumb path={`/admin/khat-brain/seasons/${season.id}`} label={season.name} />
 */
export function SetBreadcrumb({
  path,
  label,
}: {
  path: string
  label: string | null | undefined
}) {
  useSetBreadcrumbLabel(path, label)
  return null
}
