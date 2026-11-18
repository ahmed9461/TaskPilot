import { createHash } from "node:crypto";
import { z } from "zod";
import { Fault } from "./service.js";

const maxImageBytes = 4 * 1024 * 1024;
const maxTotalBytes = 8 * 1024 * 1024;
export const imageUploadLimit = Math.ceil(maxTotalBytes / 3) * 4 + 32768;
const mime = z.enum(["image/jpeg", "image/png"]);
const manifestEntry = z
  .object({
    mime,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().min(1).max(maxImageBytes),
  })
  .strict();
export const imageManifest = z
  .array(manifestEntry)
  .max(4)
  .refine(
    (list) => list.reduce((sum, item) => sum + item.size, 0) <= maxTotalBytes,
  );
export const replyImageUploads = z
  .array(
    z
      .string()
      .min(4)
      .max(Math.ceil(maxImageBytes / 3) * 4),
  )
  .max(4);
export type ReplyImageManifest = z.infer<typeof imageManifest>;
export type ReplyImage = { mime: z.infer<typeof mime>; bytes: Buffer };

export function validateReplyImages(
  manifest: ReplyImageManifest,
  uploads: string[],
): ReplyImage[] {
  if (manifest.length !== uploads.length)
    throw new Fault("REPLY_IMAGE_MISMATCH", 400);
  return manifest.map((item, index) => {
    const encoded = uploads[index]!;
    const bytes = Buffer.from(encoded, "base64");
    const isPng = bytes
      .subarray(0, 8)
      .equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const isJpeg = bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
    if (
      bytes.length !== item.size ||
      bytes.toString("base64") !== encoded ||
      (item.mime === "image/png" ? !isPng : !isJpeg) ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      throw new Fault("REPLY_IMAGE_MISMATCH", 400);
    return { mime: item.mime, bytes };
  });
}

export const imageContext = (jobId: string) => `reply-images:${jobId}`;
const storedImage = z.object({ mime, data: z.string() }).strict();
export function decodeReplyImages(data: string): ReplyImage[] {
  return z
    .array(storedImage)
    .min(1)
    .max(4)
    .parse(JSON.parse(data))
    .map((item) => ({
      mime: item.mime,
      bytes: Buffer.from(item.data, "base64"),
    }));
}
