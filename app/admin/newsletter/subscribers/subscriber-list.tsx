"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Download, Users } from "lucide-react"
import { formatDate } from "@/lib/newsletter/format"

interface Subscriber {
  id: string
  email: string
  status: string
  created_at: string
  unsubscribed_at: string | null
}

interface SubscriberListProps {
  subscribers: Subscriber[]
  counts: { all: number; active: number; unsubscribed: number }
  currentStatus: string
  currentSearch: string
}

const tabs = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "unsubscribed", label: "ألغى الاشتراك" },
] as const

export function SubscriberList({ subscribers, counts, currentStatus, currentSearch }: SubscriberListProps) {
  const router = useRouter()
  const [search, setSearch] = useState(currentSearch)

  function navigate(status: string, searchVal?: string) {
    const params = new URLSearchParams()
    if (status !== "all") params.set("status", status)
    if (searchVal?.trim()) params.set("search", searchVal.trim())
    const qs = params.toString()
    router.push(`/admin/newsletter/subscribers${qs ? `?${qs}` : ""}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate(currentStatus, search)
  }

  function handleExportCSV() {
    const header = "email,status,created_at,unsubscribed_at"
    const rows = subscribers.map(s =>
      `${s.email},${s.status},${s.created_at},${s.unsubscribed_at || ""}`
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => navigate(tab.key, search)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              currentStatus === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="mr-1.5 rounded-full bg-background/20 px-1.5 py-0.5 text-xs">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Export */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالبريد الإلكتروني..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background ps-10 pe-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            dir="ltr"
          />
        </form>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        {subscribers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-8 w-8 mb-2" />
            <p className="text-sm">{currentSearch ? "لا توجد نتائج" : "لا يوجد مشتركون"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">البريد الإلكتروني</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">تاريخ الاشتراك</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">تاريخ الإلغاء</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => (
                  <tr key={sub.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{sub.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.status === "active"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        {sub.status === "active" ? "نشط" : "ملغي"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatDate(sub.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {sub.unsubscribed_at ? formatDate(sub.unsubscribed_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
