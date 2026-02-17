-- Episode version history for safe rollback
CREATE TABLE episode_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  change_type text NOT NULL CHECK (change_type IN (
    'title_override','description_override','enrichment',
    'quotes','section_assignment','visibility',
    'guest_assignment','youtube_pack','conversation','full_snapshot'
  )),
  change_summary text,
  snapshot jsonb NOT NULL,
  created_by text DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ev_episode ON episode_versions(episode_id, created_at DESC);
