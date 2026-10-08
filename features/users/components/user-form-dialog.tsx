"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
} from "@/constants/account-status";
import { COUNTRIES } from "@/constants/countries";
import { ROLE_LABELS } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import type { UserProfile } from "@/types";
import type { CreatableRole } from "@/features/users/lib/managed-roles";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  user?: UserProfile | null;
  allowedRoles: CreatableRole[];
  defaultRole?: CreatableRole | null;
  lockRole?: boolean;
  onSaved: (user: UserProfile) => void;
}

function UserFormDialog({
  open,
  onOpenChange,
  mode,
  user,
  allowedRoles,
  defaultRole,
  lockRole,
  onSaved,
}: UserFormDialogProps) {
  const [saving, setSaving] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("none");
  const [role, setRole] = React.useState<CreatableRole>(
    defaultRole ?? allowedRoles[0] ?? "student",
  );
  const [status, setStatus] = React.useState<AccountStatus>(ACCOUNT_STATUS.ACTIVE);
  const [setupUrl, setSetupUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setCountryCode(user?.countryCode ?? "none");
    setRole(
      (user?.role as CreatableRole | undefined) ?? defaultRole ?? allowedRoles[0] ?? "student",
    );
    setStatus(user?.status ?? ACCOUNT_STATUS.ACTIVE);
    setSetupUrl(null);
    setCopied(false);
    setSaving(false);
  }, [open, user, defaultRole, allowedRoles]);

  const title =
    mode === "edit" ? "Edit account" : `Create ${ROLE_LABELS[role]?.toLowerCase() ?? "account"}`;

  async function copySetupLink() {
    if (!setupUrl) return;
    try {
      await navigator.clipboard.writeText(setupUrl);
      setCopied(true);
      toast.success("Password setup link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    if (mode === "create") {
      const result = await authFetch<{ profile: UserProfile; setupUrl: string }>(routes.api.users, {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          countryCode: countryCode === "none" ? "" : countryCode,
          role,
        }),
      });
      setSaving(false);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Could not create the account");
        return;
      }
      setSetupUrl(result.data.setupUrl);
      onSaved(result.data.profile);
      toast.success(`${ROLE_LABELS[result.data.profile.role]} account created`);
      return;
    }

    if (!user) {
      setSaving(false);
      return;
    }
    const result = await authFetch<UserProfile>(`${routes.api.users}/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        firstName,
        lastName,
        phone,
        countryCode: countryCode === "none" ? "" : countryCode,
        status,
        role,
      }),
    });
    setSaving(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Could not update the account");
      return;
    }
    onSaved(result.data);
    toast.success("Account updated");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {setupUrl
              ? "Send the password setup link if the invitation email does not arrive."
              : mode === "create"
                ? "The person receives an email with a link to set their password."
                : "Update name, contact details, or account status."}
          </DialogDescription>
        </DialogHeader>

        {setupUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-url">Password setup link</Label>
              <div className="flex gap-2">
                <Input id="setup-url" readOnly value={setupUrl} />
                <Button type="button" variant="outline" onClick={() => void copySetupLink()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="sr-only">Copy setup link</span>
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-first-name">First name</Label>
                <Input
                  id="user-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-last-name">Last name</Label>
                <Input
                  id="user-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={mode === "edit"}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-phone">Phone</Label>
                <Input
                  id="user-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+971 50 000 0000"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as CreatableRole)}
                  disabled={lockRole || (mode === "edit" && allowedRoles.length <= 1)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ROLE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "edit" ? (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as AccountStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ACCOUNT_STATUS).map((option) => (
                        <SelectItem key={option} value={option}>
                          {ACCOUNT_STATUS_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { UserFormDialog };
