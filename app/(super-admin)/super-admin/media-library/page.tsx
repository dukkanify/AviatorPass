import { redirect } from "next/navigation";

/** Legacy path — Media Library is embedded in Asset Manager. */
export default function MediaLibraryPage() {
  redirect("/super-admin/assets");
}
