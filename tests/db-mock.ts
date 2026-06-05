/**
 * Shared Drizzle DB mock for unit/integration tests.
 *
 * Strategy: mock `@/lib/db` so that `db` is a fake object whose
 * `.select()`, `.insert()`, `.update()`, `.delete()` methods return
 * chainable query builders. Each test configures return values via
 * the helpers exported here.
 *
 * This avoids touching any real database.
 */
import { vi } from "vitest"

// ── Chainable query builder mock ────────────────────────────────────────────

type Row = Record<string, unknown>

/** Stored results that the mock will return for the next query chain. */
let _selectResults: Row[][] = []
let _insertReturning: Row[] = []
let _updateReturning: Row[] = []
let _deleteResult: { rowCount: number } = { rowCount: 0 }

/** Push rows that the next `.select()` chain will resolve to. Multiple calls stack (FIFO). */
export function mockSelectResult(rows: Row[]) {
  _selectResults.push(rows)
}

export function mockInsertReturning(rows: Row[]) {
  _insertReturning = rows
}

export function mockUpdateReturning(rows: Row[]) {
  _updateReturning = rows
}

export function mockDeleteResult(rowCount: number) {
  _deleteResult = { rowCount }
}

export function resetMock() {
  _selectResults = []
  _insertReturning = []
  _updateReturning = []
  _deleteResult = { rowCount: 0 }
}

// ── Builder factories ───────────────────────────────────────────────────────

function selectChain() {
  const chain: Record<string, unknown> = {}
  const resolve = () => {
    const rows = _selectResults.length > 0 ? _selectResults.shift()! : []
    return Promise.resolve(rows)
  }

  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockImplementation(() => resolve())
  chain.leftJoin = vi.fn().mockReturnValue(chain)
  chain.innerJoin = vi.fn().mockReturnValue(chain)

  // When chain is awaited without .limit() — e.g. `await db.select().from(table)`
  chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => {
    return resolve().then(onFulfill, onReject)
  }

  return chain
}

function insertChain() {
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn().mockReturnValue(chain)
  chain.returning = vi.fn().mockImplementation(() => Promise.resolve(_insertReturning))
  chain.onConflictDoUpdate = vi.fn().mockImplementation(() => Promise.resolve())

  // Bare await (no .returning())
  chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => {
    return Promise.resolve().then(onFulfill, onReject)
  }

  return chain
}

function updateChain() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.returning = vi.fn().mockImplementation(() => Promise.resolve(_updateReturning))

  chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => {
    return Promise.resolve().then(onFulfill, onReject)
  }

  return chain
}

function deleteChain() {
  const chain: Record<string, unknown> = {}
  chain.where = vi.fn().mockImplementation(() => Promise.resolve(_deleteResult))

  chain.then = (onFulfill: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => {
    return Promise.resolve(_deleteResult).then(onFulfill, onReject)
  }

  return chain
}

function transactionMock(callback: (tx: unknown) => Promise<void>) {
  // Provide a tx that looks like db
  const tx = {
    select: vi.fn().mockReturnValue(selectChain()),
    insert: vi.fn().mockReturnValue(insertChain()),
    update: vi.fn().mockReturnValue(updateChain()),
    delete: vi.fn().mockReturnValue(deleteChain()),
  }
  return callback(tx)
}

// ── The mock `db` object ────────────────────────────────────────────────────

export const mockDb = {
  select: vi.fn().mockImplementation(() => selectChain()),
  insert: vi.fn().mockImplementation(() => insertChain()),
  update: vi.fn().mockImplementation(() => updateChain()),
  delete: vi.fn().mockImplementation(() => deleteChain()),
  transaction: vi.fn().mockImplementation(transactionMock),
  execute: vi.fn().mockImplementation(() => Promise.resolve({ rows: [] })),
}
