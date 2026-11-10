// The design canvas's own tables — what Speca's core keeps for every canvas tab (canvas_tabs, canvas_versions,
// canvas_edits, canvas_comments), here for design canvases only. See sdk/store.ts.
const sql = `
CREATE SCHEMA IF NOT EXISTS design_canvas;
CREATE TABLE IF NOT EXISTS design_canvas.tabs (
  id text PRIMARY KEY,
  agent_id text,
  owner_id text,
  title text NOT NULL,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  draft_edits integer NOT NULL DEFAULT 0,
  draft_base jsonb,
  proto jsonb,
  sync_dir text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_canvas_tabs_agent_idx ON design_canvas.tabs(agent_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS design_canvas.versions (
  tab_id text NOT NULL REFERENCES design_canvas.tabs(id) ON DELETE CASCADE,
  v integer NOT NULL,
  author text NOT NULL,
  note text,
  body jsonb NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tab_id, v)
);
CREATE TABLE IF NOT EXISTS design_canvas.edits (
  tab_id text NOT NULL REFERENCES design_canvas.tabs(id) ON DELETE CASCADE,
  n integer NOT NULL,
  author text NOT NULL,
  note text,
  body jsonb NOT NULL,
  undone_at timestamptz,
  dropped_at timestamptz,
  undo_of integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tab_id, n)
);
CREATE TABLE IF NOT EXISTS design_canvas.comments (
  id text PRIMARY KEY,
  tab_id text NOT NULL REFERENCES design_canvas.tabs(id) ON DELETE CASCADE,
  author text NOT NULL,
  author_name text NOT NULL,
  anchor jsonb NOT NULL,
  label text NOT NULL DEFAULT '',
  body text NOT NULL,
  replies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_canvas_comments_tab_idx ON design_canvas.comments(tab_id, created_at);
`;
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "DROP SCHEMA IF EXISTS design_canvas CASCADE" }); },
};
