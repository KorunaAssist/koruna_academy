type WriteResult = { count: number; error?: { code?: string; message: string } | null };
type ProgressWriter = {
  update: () => Promise<WriteResult>;
  insert: () => Promise<WriteResult>;
};

// UPDATE existing assignments directly: INSERT triggers run before ON CONFLICT
// and must reject learner attempts to supply staff-owned assignment fields.
export async function persistProgress(writer: ProgressWriter): Promise<void> {
  const updated = await writer.update();
  if (updated.error) throw new Error(`Unable to save learning progress: ${updated.error.message}`);
  if (updated.count > 0) return;

  const inserted = await writer.insert();
  if (!inserted.error && inserted.count > 0) return;
  // Another request may have created the same progress record in the meantime.
  if (inserted.error?.code === '23505') {
    const retry = await writer.update();
    if (!retry.error && retry.count > 0) return;
    throw new Error(`Unable to save learning progress: ${retry.error?.message || 'record is not writable'}`);
  }
  throw new Error(`Unable to save learning progress: ${inserted.error?.message || 'record is not writable'}`);
}

export function learnerProgressFields(row: Record<string, unknown>): Record<string, unknown> {
  const fields = ['progress_percent', 'completed_lessons', 'quiz_score', 'quiz_attempts',
    'learning_hours', 'last_viewed_at', 'practical_notes', 'quiz_history'];
  return Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]));
}
