/**
 * Admin date/time utilities.
 * Re-exports from shared formatters with admin-specific aliases.
 */

import {
  formatDateCompact as formatDateDDMMYYYY,
  formatRelativeTime as getRelativeTime,
  getKuwaitGreeting as getGreeting,
} from "@/lib/shared/formatters"

export { formatDateDDMMYYYY, getRelativeTime, getGreeting }
