// @vitest-environment jsdom
/**
 * Review follow-up (noura) to defect #8: the constitution warning on a manual
 * topic offers «أضف رغم التحذير», which resends with confirmPolicyWarning.
 * If the title (or hook — the policy reads both) is edited after the warning,
 * that button would add NEW text nobody re-checked. Editing either field must
 * clear the warning, so the next add goes through the check again.
 */
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const h = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock("@/app/admin/khat-brain/seasons/actions", () => ({ addManualTopicAction: h.add }))
vi.mock("@/app/admin/components/run-action", () => ({
  runAction: async (fn: () => Promise<unknown>) => ({ ok: true, data: await fn() }),
}))

import { AddTopicModal } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/add-topic-modal"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text))
}

async function showWarning() {
  h.add.mockResolvedValue({
    success: false,
    code: "POLICY_WARNING",
    error: "تنبيه: العنوان يمسّ ما يتجنبه دستور خط (خلاف ديني). اضغط «أضف رغم التحذير».",
  })
  const title = container.querySelector("input[type=text]") as HTMLInputElement
  await act(async () => typeInto(title, "رحلتي من الإلحاد إلى الإيمان"))
  await act(async () => button("إضافة الموضوع")!.click())
  expect(button("أضف رغم التحذير")).toBeDefined()
}

beforeEach(async () => {
  h.add.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(createElement(AddTopicModal, { open: true, seasonId: "s1", onClose: () => {}, onAdded: () => {} })),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("AddTopicModal — a stale constitution warning can't add edited text", () => {
  it("editing the title clears the warning and its override button", async () => {
    await showWarning()
    const title = container.querySelector("input[type=text]") as HTMLInputElement
    await act(async () => typeInto(title, "عنوان آخر تماماً"))
    expect(button("أضف رغم التحذير")).toBeUndefined()
  })

  it("editing the hook clears it too (the policy reads title + hook)", async () => {
    await showWarning()
    const hook = container.querySelector("textarea") as HTMLTextAreaElement
    await act(async () => typeInto(hook, "خطاف جديد"))
    expect(button("أضف رغم التحذير")).toBeUndefined()
  })

  it("unedited, the override resends the SAME title with the confirm", async () => {
    await showWarning()
    h.add.mockResolvedValue({ success: true, data: { topic: { id: "t1" } } })
    await act(async () => button("أضف رغم التحذير")!.click())
    expect(h.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ working_title: "رحلتي من الإلحاد إلى الإيمان", confirmPolicyWarning: true }),
    )
  })
})
