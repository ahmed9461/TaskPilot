import { z } from "zod";
export const id = z.string().uuid();
export const text = z.string().trim().min(1).max(200);
export const assignmentStatus = z.enum([
  "NEW",
  "NEEDS_REVIEW",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
]);
export const accountInput = z
  .object({
    namespace: text,
    username: text,
    displayName: text,
    password: z.string().min(1).max(1024).optional(),
  })
  .strict();
export const messageInput = z
  .object({
    sessionId: id,
    groupId: id,
    externalMessageId: text,
    text: z.string().min(1).max(16000),
  })
  .strict();
export type MessageInput = z.infer<typeof messageInput>;
export const safeFields = ["displayName", "taskName"] as const;
