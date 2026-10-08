"use client";

import * as React from "react";
import { MoreHorizontal, Users } from "lucide-react";
import { toast } from "sonner";

import type { Role, UserProfile } from "@/types";
import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
} from "@/constants/account-status";
import { ROLE_LABELS } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/dashboard/data-table";
import { useAuth } from "@/providers/auth-provider";
import { UserFormDialog } from "@/features/users/components/user-form-dialog";
import {
  creatableRolesFor,
  defaultCreateLabel,
  type CreatableRole,
} from "@/features/users/lib/managed-roles";

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  inactive: "secondary",
};

interface UserManagementTableProps {
  title: string;
  description: string;
  roleFilter?: Role | null;
  emptyTitle?: string;
  emptyAction?: { label: string; href?: string };
}

function UserManagementTable({
  title,
  description,
  roleFilter = null,
  emptyTitle = "No users found",
  emptyAction,
}: UserManagementTableProps) {
  const { user: actor } = useAuth();
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserProfile | null>(null);

  const allowedRoles = React.useMemo(() => {
    const roles = creatableRolesFor(actor?.role ?? "student");
    if (roleFilter && roles.includes(roleFilter as CreatableRole)) {
      return [roleFilter as CreatableRole];
    }
    return roles;
  }, [actor?.role, roleFilter]);

  const createLabel = emptyAction?.label ?? defaultCreateLabel(roleFilter);
  const defaultRole = (roleFilter as CreatableRole | null) ?? allowedRoles[0] ?? "student";
  const canCreate = allowedRoles.length > 0;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = roleFilter ? `?role=${roleFilter}` : "";
    const result = await authFetch<UserProfile[]>(`/api/users${params}`);
    if (!result.success) {
      setError(result.error ?? "Failed to load users");
      setUsers([]);
    } else {
      setUsers(result.data ?? []);
    }
    setLoading(false);
  }, [roleFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1" && canCreate) {
      setCreateOpen(true);
      params.delete("create");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState(null, "", next);
    }
  }, [canCreate]);

  const filtered = statusFilter === "all" ? users : users.filter((u) => u.status === statusFilter);

  async function changeStatus(target: UserProfile, status: AccountStatus) {
    const result = await authFetch<UserProfile>(`${routes.api.users}/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Could not change status");
      return;
    }
    setUsers((current) => current.map((row) => (row.id === result.data!.id ? result.data! : row)));
    toast.success(
      `${result.data.fullName || result.data.email} is now ${ACCOUNT_STATUS_LABELS[status]}`,
    );
  }

  const columns: DataTableColumn<UserProfile>[] = [
    {
      id: "fullName",
      header: "Name",
      sortable: true,
      cell: (row) => (
        <div>
          <p className="font-medium">{row.fullName || "—"}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      cell: (row) => <Badge variant="outline">{ROLE_LABELS[row.role]}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        <Badge variant={statusVariant[row.status] ?? "secondary"}>
          {ACCOUNT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      id: "countryCode",
      header: "Country",
      cell: (row) => row.countryCode || "—",
    },
    {
      id: "lastLoginAt",
      header: "Last login",
      cell: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : "Never"),
    },
    {
      id: "actions",
      header: "",
      className: "w-12",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Row actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(row)}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            {Object.values(ACCOUNT_STATUS)
              .filter((status) => status !== row.status)
              .map((status) => (
                <DropdownMenuItem key={status} onClick={() => void changeStatus(row, status)}>
                  Mark {ACCOUNT_STATUS_LABELS[status].toLowerCase()}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: title }]}
        actions={
          canCreate ? <Button onClick={() => setCreateOpen(true)}>{createLabel}</Button> : undefined
        }
      />

      {error ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Unable to load users"
          description={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : !loading && filtered.length === 0 && statusFilter === "all" ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={emptyTitle}
          description="Accounts matching this filter will appear here once created."
          actionLabel={canCreate ? createLabel : undefined}
          onAction={canCreate ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          searchPlaceholder="Search by name or email..."
          searchKeys={["fullName", "email", "firstName", "lastName"]}
          emptyMessage="No users match your filters"
          onExport={(rows) => {
            const csv = [
              ["Name", "Email", "Role", "Status", "Country"].join(","),
              ...rows.map((r) =>
                [r.fullName, r.email, r.role, r.status, r.countryCode]
                  .map((v) => `"${v ?? ""}"`)
                  .join(","),
              ),
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "users.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          filters={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      )}

      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        allowedRoles={allowedRoles}
        defaultRole={defaultRole}
        lockRole={Boolean(roleFilter)}
        onSaved={(created) => {
          setUsers((current) => [created, ...current.filter((row) => row.id !== created.id)]);
        }}
      />
      <UserFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        user={editing}
        allowedRoles={
          editing && allowedRoles.includes(editing.role as CreatableRole)
            ? allowedRoles
            : editing
              ? [editing.role as CreatableRole, ...allowedRoles]
              : allowedRoles
        }
        defaultRole={(editing?.role as CreatableRole | undefined) ?? defaultRole}
        lockRole={Boolean(roleFilter) || actor?.role !== "super_admin"}
        onSaved={(updated) => {
          setUsers((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        }}
      />
    </div>
  );
}

export { UserManagementTable };
