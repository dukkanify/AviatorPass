import { JoinClassClient } from "@/features/classes/components/join-class-client";

export default async function JoinClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JoinClassClient classId={id} />;
}
