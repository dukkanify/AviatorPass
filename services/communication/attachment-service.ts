/**
 * Communication attachments — local public/uploads/communication with Supabase readiness.
 * Virus-scan hook runs before persistence.
 */

import path from "path";

import { generateId } from "@/lib/security/crypto";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { putUploadedFile, UploadBackendError } from "@/lib/ops/upload-backend";
import { COMM_ATTACHMENT_MIME_ALLOW } from "@/constants/communication";
import { CommunicationError } from "@/services/communication/access";
import { writeCommunicationDb } from "@/services/communication/store";
import { virusScanHook } from "@/lib/security/upload";
import type { AttachmentRef } from "@/types/communication";

function guessExt(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
  };
  return map[mime] ?? "";
}

export async function uploadCommunicationAttachment(input: {
  file: File;
  actorId: string;
}): Promise<AttachmentRef> {
  const settings = getPlatformSettings();
  const maxBytes = settings.security.maxUploadSizeMb * 1024 * 1024;
  if (input.file.size > maxBytes) {
    throw new CommunicationError(`File exceeds ${settings.security.maxUploadSizeMb}MB limit`);
  }

  const mime = input.file.type || "application/octet-stream";
  if (mime !== "application/octet-stream" && !COMM_ATTACHMENT_MIME_ALLOW.has(mime)) {
    throw new CommunicationError(`File type ${mime} is not allowed`);
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const scan = await virusScanHook(buffer);
  if (!scan.clean) {
    throw new CommunicationError("Attachment failed security scan", 422);
  }

  const ext = path.extname(input.file.name) || guessExt(mime);
  const fileName = `comm-${generateId().slice(0, 12)}${ext.toLowerCase()}`;
  const relativePath = `communication/${input.actorId}/${fileName}`;

  let publicUrl: string;
  try {
    const stored = await putUploadedFile({
      relativePath,
      bytes: buffer,
      contentType: mime,
    });
    publicUrl = stored.publicUrl;
  } catch (error) {
    if (error instanceof UploadBackendError) {
      throw new CommunicationError(error.message, error.status);
    }
    throw error;
  }

  const attachment: AttachmentRef = {
    id: generateId(),
    fileName: input.file.name,
    mimeType: mime,
    sizeBytes: input.file.size,
    url: publicUrl,
    uploadedById: input.actorId,
    createdAt: new Date().toISOString(),
  };

  writeCommunicationDb((db) => {
    db.attachments.unshift(attachment);
  });

  return attachment;
}
