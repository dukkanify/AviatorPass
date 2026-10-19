import type { Metadata } from "next";

import { ClassroomLobby } from "@/features/classes/components/classroom-lobby";
import { MEETING_SDK_APP_NAME } from "@/features/zoom/content/meeting-sdk-public";

export const metadata: Metadata = {
  title: MEETING_SDK_APP_NAME,
  robots: { index: false, follow: false },
};

export default function ClassroomLobbyPage() {
  return <ClassroomLobby />;
}
