"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  sectionName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[Studio] Error in ${this.props.sectionName || "section"}:`, error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-red-400/70" />
          <div>
            <p className="text-[13px] font-medium text-red-600 dark:text-red-400">
              حدث خطأ في {this.props.sectionName || "هذا القسم"}
            </p>
            <p className="text-[11px] text-red-500/60 mt-1">
              {this.state.error?.message || "خطأ غير متوقع"}
            </p>
          </div>
          <Button onClick={this.handleRetry} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
