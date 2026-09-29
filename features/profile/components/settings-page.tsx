"use client";

import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import { SessionManagementCard } from "@/features/profile/components/session-management-card";
import {
  StudentAccountFields,
  type StudentAccountFieldValues,
} from "@/features/profile/components/student-account-fields";
import { updateProfileSchema } from "@/utils/validation";
import { sanitizeString } from "@/utils/sanitize";
import type { UserProfile } from "@/types";

function emptyValues(user: UserProfile): StudentAccountFieldValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
    countryCode: user.countryCode ?? "",
    nationality: user.nationality ?? "",
    dateOfBirth: user.dateOfBirth ?? "",
    gender: (user.gender as StudentAccountFieldValues["gender"]) ?? "",
    city: user.city ?? "",
    bio: user.bio ?? "",
    emergencyContactName: user.emergencyContactName ?? "",
    emergencyContactPhone: user.emergencyContactPhone ?? "",
    timezone: user.timezone ?? "UTC",
    language: user.language ?? "en",
  };
}

function SettingsPageView() {
  const { user, isLoading, setUser, refresh } = useAuth();
  const [values, setValues] = React.useState<StudentAccountFieldValues | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (user) setValues(emptyValues(user));
  }, [user]);

  if (isLoading || !user || !values) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const onChange = (patch: Partial<StudentAccountFieldValues>) => {
    setValues((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateProfileSchema.safeParse({
      firstName: sanitizeString(values.firstName),
      lastName: sanitizeString(values.lastName),
      phone: sanitizeString(values.phone),
      countryCode: values.countryCode,
      nationality: sanitizeString(values.nationality),
      dateOfBirth: values.dateOfBirth || "",
      gender: values.gender || "",
      city: sanitizeString(values.city),
      bio: sanitizeString(values.bio),
      emergencyContactName: sanitizeString(values.emergencyContactName),
      emergencyContactPhone: sanitizeString(values.emergencyContactPhone),
      timezone: values.timezone,
      language: values.language,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setPending(true);
    try {
      const result = await authFetch<{ user: UserProfile }>(routes.api.auth.profile, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Unable to update settings");
        return;
      }
      setUser(result.data.user);
      await refresh();
      toast.success("Settings saved");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Timezone, language, and signed-in devices. Profile details live on a separate page."
        breadcrumbs={[{ label: "Settings" }]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Preferences</CardTitle>
          <CardDescription>
            These settings apply across AviatorPass, not your public profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <StudentAccountFields
              values={values}
              onChange={onChange}
              requireStudentBasics={false}
              disabled={pending}
              sections={["preferences"]}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <SessionManagementCard />
    </div>
  );
}

export { SettingsPageView };
