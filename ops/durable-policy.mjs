import { open, rename, unlink, lstat, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export async function durableReplace(path, text, stat) {
  const temporary = path + ".pending-" + randomUUID();
  let file;
  try {
    file = await open(temporary, "wx", 0o600);
    await file.chown(stat.uid, stat.gid);
    await file.chmod(stat.mode & 0o777);
    await file.writeFile(text, "utf8");
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await file?.close();
    await unlink(temporary).catch(() => {});
  }
}
export async function journalStamp(path, owner) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.uid !== owner || stat.mode & 0o027)
      throw Error("SENDING_POLICY_UNAVAILABLE");
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text) > 4096)
      throw Error("SENDING_POLICY_UNAVAILABLE");
    return { text, hash: createHash("sha256").update(text).digest("hex") };
  } catch (error) {
    if (error?.code === "ENOENT") return { text: "", hash: null };
    throw error;
  }
}
