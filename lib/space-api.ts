// Client-side API helpers for Hibr
// All mutations include X-Requested-With header for CSRF protection

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'khat',
}

async function apiCall<T>(url: string, options?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...options?.headers },
    })

    const json = await res.json()

    if (!res.ok) {
      return { error: json.error || 'حدث خطأ غير متوقع' }
    }

    return { data: json }
  } catch {
    return { error: 'حدث خطأ في الاتصال' }
  }
}

// Articles
export function createArticle(data: {
  title: string
  content: string
  excerpt?: string
  tags?: string[]
  episode_id?: string
  episode_title?: string
  episode_slug?: string
}) {
  return apiCall('/api/space/articles', { method: 'POST', body: JSON.stringify(data) })
}

export function updateArticle(id: string, data: { title?: string; content?: string; tags?: string[] }) {
  return apiCall(`/api/space/articles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteArticle(id: string) {
  return apiCall(`/api/space/articles/${id}`, { method: 'DELETE' })
}

// Thoughts
export function createThought(data: { content: string; tags?: string[] }) {
  return apiCall('/api/space/thoughts', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteThought(id: string) {
  return apiCall(`/api/space/thoughts/${id}`, { method: 'DELETE' })
}

// Comments
export function createComment(data: { article_id: string; content: string }) {
  return apiCall('/api/space/comments', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteComment(id: string) {
  return apiCall(`/api/space/comments/${id}`, { method: 'DELETE' })
}

// Replies
export function createReply(thoughtId: string, data: { content: string }) {
  return apiCall(`/api/space/thoughts/${thoughtId}/replies`, { method: 'POST', body: JSON.stringify(data) })
}

// Likes
export function toggleLike(targetType: string, targetId: string) {
  return apiCall('/api/space/likes', { method: 'POST', body: JSON.stringify({ target_type: targetType, target_id: targetId }) })
}

// Bookmarks
export function toggleBookmarkApi(articleId: string) {
  return apiCall('/api/space/bookmarks', { method: 'POST', body: JSON.stringify({ article_id: articleId }) })
}

// Reactions
export function toggleReaction(articleId: string, reactionType: string) {
  return apiCall('/api/space/reactions', { method: 'POST', body: JSON.stringify({ article_id: articleId, reaction_type: reactionType }) })
}

// Follows
export function toggleFollow(followingId: string) {
  return apiCall('/api/space/follows', { method: 'POST', body: JSON.stringify({ following_id: followingId }) })
}

// Reports
export function createReport(data: { target_type: string; target_id: string; reason: string; details?: string }) {
  return apiCall('/api/space/reports', { method: 'POST', body: JSON.stringify(data) })
}

// Drafts
export function getDraftsApi() {
  return apiCall<{ drafts: unknown[] }>('/api/space/drafts')
}

export function saveDraftApi(data: {
  id?: string
  title?: string
  content?: string
  tags?: string[]
  episode_id?: string
  episode_slug?: string
  episode_title?: string
}) {
  return apiCall('/api/space/drafts', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteDraftApi(id: string) {
  return apiCall(`/api/space/drafts/${id}`, { method: 'DELETE' })
}

// Moderation (admin)
export function getModerationQueue(tab: string, page = 1) {
  return apiCall(`/api/space/admin/moderation?tab=${tab}&page=${page}`)
}

export function moderateContent(id: string, data: { action: string; target_type: string; reason?: string }) {
  return apiCall(`/api/space/admin/moderation/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}
