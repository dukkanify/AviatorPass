/**
 * Encrypt Zoom OAuth tokens at rest (AES-256-GCM).
 * Key is derived from AUTH_SECRET — never persist plaintext tokens.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { getServerEnv } from "@/config/env";

const PREFIX = "v1";
/** AES-GCM authentication tag length in bytes (128-bit tag). */
const GCM_AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const secret = getServerEnv().AUTH_SECRET;
  return createHash("sha256").update(`aviatorpass:zoom-oauth:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_AUTH_TAG_LENGTH) {
    throw new Error("Unexpected Zoom token authentication tag length");
  }
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Invalid encrypted Zoom token payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const tag = Buffer.from(tagB64!, "base64url");
  // Reject truncated tags — GCM without a fixed expected tag length can be forged.
  if (tag.length !== GCM_AUTH_TAG_LENGTH) {
    throw new Error("Invalid Zoom token authentication tag length");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64!, "base64url"),
    { authTagLength: GCM_AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function looksEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`) && value.split(":").length === 4;
}
