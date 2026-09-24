/**
 * Optional inbound email replies into AviatorPass conversations.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb, toUserProfile } from "@/services/auth/store";
import {
  conversationIdFromMailbox,
  ingestInboundEmail,
  stripQuotedReply,
} from "@/services/communication/inbound-email-service";
import { startDirectConversation } from "@/services/communication/messaging-service";
import { writeCommunicationDb } from "@/services/communication/store";
import { readCommunicationDb } from "@/services/communication/store";

describe("inbound email to conversation", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    writeCommunicationDb((db) => {
      db.conversations = [];
      db.messages = [];
      db.typing = [];
      db.presence = [];
      db.seeded = true;
    });
  });

  it("parses plus-address conversation ids and quoted replies", () => {
    expect(conversationIdFromMailbox("Messages+abc123@inbound.aviatorpass.com")).toBe("abc123");
    expect(stripQuotedReply("I will attend.\n\nOn Tue, Student wrote:\n> previous")).toBe(
      "I will attend.",
    );
  });

  it("posts a reply from a conversation participant", async () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const conv = await startDirectConversation({
      user: toUserProfile(instructor),
      peerUserId: student.id,
    });

    const result = await ingestInboundEmail({
      from: student.email,
      to: `messages+${conv.id}@inbound.aviatorpass.com`,
      subject: "Re: New message",
      text: "Thanks — I uploaded the homework.\n\nOn Tue, Instructor wrote:\n> Please upload",
    });

    expect(result.accepted).toBe(true);
    expect(result.conversationId).toBe(conv.id);
    const stored = readCommunicationDb().messages.find((row) => row.id === result.messageId);
    expect(stored?.body).toBe("Thanks — I uploaded the homework.");
    expect(stored?.senderId).toBe(student.id);
  });

  it("rejects senders who are not in the conversation", async () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const outsider = readAuthDb().users.find(
      (user) => user.role === ROLES.ADMIN && user.status === "active",
    )!;
    const conv = await startDirectConversation({
      user: toUserProfile(instructor),
      peerUserId: student.id,
    });
    const result = await ingestInboundEmail({
      from: outsider.email,
      to: `messages+${conv.id}@inbound.aviatorpass.com`,
      text: "I should not land in this thread.",
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("not_participant");
  });
});
