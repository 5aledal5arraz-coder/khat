# KHAT Podcast CMS Design

## Overview

A comprehensive Content Management System designed for the KHAT Podcast website, focusing on ease of use, clear structure, and fast workflows.

---

## Dashboard Structure

```
/admin
├── / (Dashboard Home - Overview & Quick Actions)
├── /episodes (Episode Management)
├── /guests (Guest Management)
├── /topics (Topic/Tag Management)
├── /content (Static Page Content)
├── /submissions (Forms & Applications)
├── /community (حبر/Hibr Moderation)
├── /ads (Advertising & Sponsors)
├── /settings (Site Configuration)
└── /analytics (Stats & Insights)
```

---

## 1. Dashboard Home (`/admin`)

### Quick Stats Cards
- Total Episodes
- Total Guests
- Newsletter Subscribers
- Pending Applications (Guest + Sponsor)
- Community Posts (حبر)

### Quick Actions
- "Sync YouTube Episodes" button
- "View New Submissions" link
- "Feature an Episode" quick action
- Recent activity feed

### Alerts Section
- New guest applications requiring review
- New sponsorship inquiries
- Flagged community content (future)

---

## 2. Episodes Management (`/admin/episodes`)

### Features
| Feature | Description |
|---------|-------------|
| List View | Table with search, filter by season, sort by date |
| Bulk Actions | Feature/unfeature, change season |
| Quick Edit | Inline title editing (existing) |
| Full Edit | Modal/drawer with all fields |
| YouTube Sync | Button to refresh from YouTube API |

### Episode Edit Fields
- **Basic Info**
  - Title (override)
  - Custom Description
  - Summary
  - Key Takeaways (rich text)

- **Metadata**
  - Season (dropdown: 1, 2, clips, unreleased)
  - Episode Number
  - Mood (dropdown: inspiring, educational, emotional, etc.)
  - Featured (toggle)

- **Media**
  - YouTube URL (auto-detected)
  - Custom Thumbnail (upload or YouTube default)

- **Guest**
  - Link to Guest (dropdown)
  - Guest Testimonial
  - Guest Video URL

- **Content Enrichment**
  - Timestamps (add/remove time markers)
  - Quotes (add memorable quotes)
  - Resources (add links mentioned)
  - Related Topics (multi-select)

### Episode List Columns
| Column | Sortable | Filterable |
|--------|----------|------------|
| Thumbnail | No | No |
| Title | Yes | Search |
| Guest | Yes | Dropdown |
| Season | Yes | Dropdown |
| Date | Yes | Date range |
| Featured | Yes | Toggle |
| Status | Yes | Dropdown |

---

## 3. Guests Management (`/admin/guests`)

### Features
- Add new guest
- Edit guest profile
- View guest's episodes
- Upload/manage photos

### Guest Edit Fields
- **Profile**
  - Name (Arabic + English)
  - Bio (rich text)
  - Photo (upload with crop)
  - Slug (auto-generated)

- **Links**
  - Social media links (dynamic add/remove)
  - Website
  - LinkedIn
  - Twitter/X
  - Instagram
  - YouTube

### Guest List View
- Photo thumbnail
- Name
- Number of episodes
- Quick link to episodes
- Edit/Delete actions

---

## 4. Topics Management (`/admin/topics`)

### Features
- Create/edit topics
- Assign topics to episodes
- View episode count per topic
- Merge duplicate topics

### Topic Fields
- Name (Arabic)
- Slug
- Description
- Color (for badges)
- Icon (optional)

---

## 5. Content Management (`/admin/content`)

### Static Pages Editor
Manage content for:

| Page | Editable Sections |
|------|-------------------|
| Home | Hero video, Featured section titles, Newsletter CTA |
| About | Host info, Welcome video, Team members, Values |
| Contact | Contact info, Form settings |
| Resources | Resource categories, Links |
| Store | Coming soon message, Launch settings |

### Content Blocks System
Each page built from reusable blocks:
- Hero Section
- Text Block
- Image Gallery
- Video Embed
- CTA Button
- Team Grid
- Quote Block

---

## 6. Submissions (`/admin/submissions`)

### Three Tabs

#### Guest Applications
| Column | Action |
|--------|--------|
| Name | View profile |
| Email | Copy |
| Topic | View |
| Status | Pending/Reviewed/Contacted/Rejected |
| Date | Sort |
| Actions | View details, Mark status, Email |

#### Sponsorship Inquiries
| Column | Action |
|--------|--------|
| Name | View |
| Company | View |
| Package | Selected package |
| Status | New/Contacted/Negotiating/Closed |
| Date | Sort |
| Actions | View details, Mark status |

#### Newsletter Subscribers
- Total count
- Export to CSV
- Unsubscribe management
- Subscription date range filter

---

## 7. Community/حبر Management (`/admin/community`)

### Content Moderation
- View all articles
- View all thoughts
- Flag/unflag content
- Feature/unfeature articles
- Delete inappropriate content

### Author Management
- View all authors (including bots)
- Edit bot author profiles
- Suspend authors (future)

### Writing Prompts
- Add/edit/remove writing prompts
- Set prompt rotation

### Moderation Queue
- Reported content
- Auto-flagged content (bad words)
- Quick actions: Approve, Remove, Warn

---

## 8. Ads Management (`/admin/ads`) - Enhanced

### Current Features (Keep)
- Sponsored card toggle & settings
- Banner ad toggle & settings

### New Features
- Multiple ad slots management
- Schedule ads (start/end date)
- Ad performance tracking
- Ad placement preview

### Ad Slots
| Slot | Location | Type |
|------|----------|------|
| Home Sponsored | Home page | Card |
| Episode Banner | Episode page | Banner |
| Space Sidebar | حبر sidebar | Card |
| Footer Banner | All pages | Banner |

---

## 9. Settings (`/admin/settings`)

### General Settings
- Site name
- Site description
- Logo upload
- Favicon
- Social media links

### Navigation
- Edit header menu items
- Edit footer links
- Edit mobile nav

### SEO
- Default meta title template
- Default meta description
- OG image default

### Integrations
- YouTube API key
- Supabase connection status
- Newsletter service (future)

### Feature Flags
- Enable/disable Store
- Enable/disable Community (حبر)
- Enable/disable Guest applications
- Maintenance mode

---

## 10. Analytics (`/admin/analytics`)

### Overview Dashboard
- Page views (chart)
- Top episodes
- Top guests
- Geographic distribution (future)

### Episode Performance
- Views per episode
- Completion rate
- Engagement metrics

### Community Stats
- Articles published
- Active authors
- Most liked content

---

## UI/UX Design Principles

### 1. Consistent Layout
```
┌─────────────────────────────────────────────────────┐
│  Logo    Dashboard Title              User Menu     │
├─────────┬───────────────────────────────────────────┤
│         │                                           │
│  Side   │         Main Content Area                 │
│  Nav    │                                           │
│         │                                           │
│         │                                           │
│         │                                           │
└─────────┴───────────────────────────────────────────┘
```

### 2. Quick Actions
- Floating action button for common tasks
- Keyboard shortcuts (Ctrl+S to save, etc.)
- Inline editing where possible

### 3. Feedback
- Toast notifications for all actions
- Loading states
- Confirmation dialogs for destructive actions

### 4. Mobile Responsive
- Collapsible sidebar
- Touch-friendly buttons
- Swipe actions on tables

### 5. Arabic RTL Support
- All inputs support RTL
- Preview shows RTL layout
- Bilingual labels where needed

---

## Data Storage Strategy

### JSON Config Files (Simple settings)
```
/config/
├── site-settings.json    (general settings)
├── episode-overrides.json (existing)
├── ads.json (existing)
├── navigation.json (menu structure)
└── feature-flags.json (toggles)
```

### Supabase Database (Structured data)
- Episodes metadata
- Guests
- Topics
- User submissions
- Community content

### File Uploads
- Use Supabase Storage or local `/public/uploads/`
- Support for: images, thumbnails, logos

---

## Implementation Priority

### Phase 1 - Core (Week 1)
1. ✅ Dashboard layout & navigation
2. ✅ Enhanced episodes management
3. ✅ Guests management
4. ✅ Submissions viewer

### Phase 2 - Content (Week 2)
5. Topics management
6. Static content editor
7. Enhanced ads management
8. Settings page

### Phase 3 - Community (Week 3)
9. Community moderation
10. Analytics dashboard
11. Feature flags
12. Polish & testing

---

## Component Library

Reuse existing shadcn/ui components:
- Card, Button, Input, Textarea
- Table, Tabs, Dialog, Sheet
- Select, Switch, Badge
- Toast, Alert

New components needed:
- `AdminLayout` - Dashboard shell
- `DataTable` - Sortable, filterable table
- `ImageUpload` - Drag & drop image upload
- `RichTextEditor` - For descriptions/content
- `QuickEdit` - Inline edit field

---

## Security Considerations

### Current State
- No authentication (admin is public)

### Recommended
1. Add simple password protection (quick)
2. Or Supabase Auth integration (proper)
3. Session management
4. Audit logging for changes

---

## Summary

This CMS design provides:

| Goal | Solution |
|------|----------|
| Easy Editing | Inline edits, modals, quick actions |
| Clear Structure | Logical grouping, consistent navigation |
| Fast Workflows | Bulk actions, keyboard shortcuts, auto-save |
| Full Coverage | All content types managed in one place |
| Scalability | Modular design, feature flags |

Ready to implement? Start with Phase 1 for immediate value.
