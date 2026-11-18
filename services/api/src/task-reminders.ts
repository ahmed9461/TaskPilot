import type pg from "pg";
import { z } from "zod";
import { transaction, event } from "./db.js";
import { Fault, type Service } from "./service.js";

export const noteUpdate = z
  .object({
    note: z.string().trim().max(2000),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const noteContext = (id: string) => `task-note:${id}`;

export async function readTaskNote(service: Service, assignmentId: string) {
  const row = (
    await service.pool.query(
      `SELECT a.id,ac.display_name,a.activity_label,t.name task_name,n.version,n.ciphertext,n.due_at,n.fired_at
     FROM assignments a JOIN accounts ac ON ac.id=a.account_id JOIN task_types t ON t.id=a.task_type_id
     LEFT JOIN task_followup_notes n ON n.assignment_id=a.id WHERE a.id=$1 AND ac.archived_at IS NULL`,
      [assignmentId],
    )
  ).rows[0];
  if (!row) throw new Fault("NOT_FOUND", 404);
  const { ciphertext, ...metadata } = row;
  return {
    ...metadata,
    version: row.version ?? 0,
    note: ciphertext
      ? service.vault.open(ciphertext, noteContext(assignmentId))
      : "",
  };
}

export async function saveTaskNote(
  service: Service,
  assignmentId: string,
  p: z.infer<typeof noteUpdate>,
) {
  return transaction(service.pool, async (c) => {
    const assignment = (
      await c.query(
        `SELECT a.status,ac.archived_at FROM assignments a JOIN accounts ac ON ac.id=a.account_id
       WHERE a.id=$1 FOR UPDATE OF a`,
        [assignmentId],
      )
    ).rows[0];
    if (!assignment || assignment.archived_at)
      throw new Fault("NOT_FOUND", 404);
    const old = (
      await c.query(
        "SELECT version,due_at FROM task_followup_notes WHERE assignment_id=$1",
        [assignmentId],
      )
    ).rows[0];
    if ((old?.version ?? 0) !== p.version) throw new Fault("CONFLICT");
    const due = p.dueAt === null ? null : new Date(p.dueAt);
    const newDate =
      (old?.due_at?.getTime() ?? null) !== (due?.getTime() ?? null);
    if (
      due &&
      newDate &&
      (["COMPLETED", "CANCELED"].includes(assignment.status) ||
        due.getTime() <= Date.now())
    )
      throw new Fault("REMINDER_TIME_UNAVAILABLE", 400);
    const ciphertext = p.note
      ? service.vault.seal(p.note, noteContext(assignmentId))
      : null;
    const result = (
      await c.query(
        `INSERT INTO task_followup_notes(assignment_id,ciphertext,due_at) VALUES($1,$2,$3)
       ON CONFLICT(assignment_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,due_at=EXCLUDED.due_at,
         version=task_followup_notes.version+1,fired_at=CASE WHEN $4 THEN NULL ELSE task_followup_notes.fired_at END
       RETURNING version,due_at,fired_at`,
        [assignmentId, ciphertext, due, newDate],
      )
    ).rows[0];
    await event(c, "TASK_NOTE_UPDATED", assignmentId);
    return result;
  });
}
export async function fireTaskReminders(pool: pg.Pool) {
  return transaction(pool, async (c) => {
    const due = (
      await c.query(
        `SELECT n.assignment_id FROM task_followup_notes n JOIN assignments a ON a.id=n.assignment_id
       JOIN accounts ac ON ac.id=a.account_id
       WHERE n.due_at<=now() AND n.fired_at IS NULL AND ac.archived_at IS NULL
         AND a.status NOT IN ('COMPLETED','CANCELED')
       ORDER BY n.due_at,n.assignment_id LIMIT 25 FOR UPDATE OF n SKIP LOCKED`,
      )
    ).rows;
    for (const row of due) {
      await c.query(
        "UPDATE task_followup_notes SET fired_at=now() WHERE assignment_id=$1",
        [row.assignment_id],
      );
      await event(c, "TASK_REMINDER_DUE", row.assignment_id);
    }
    return due.length;
  });
}
export function startTaskReminders(pool: pg.Pool) {
  let current: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (!current)
      current = fireTaskReminders(pool)
        .catch(() => {})
        .finally(() => {
          current = undefined;
        });
  }, 15_000);
  return async () => {
    clearInterval(timer);
    await current;
  };
}
