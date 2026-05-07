"use client";

import { NotesFeed } from "./notes-feed";

// Backward-compat wrapper
export function HitNotesFeed({ hitId }: { hitId: string }) {
  return <NotesFeed notesUrl={`/api/hits/${hitId}/notes`} />;
}
