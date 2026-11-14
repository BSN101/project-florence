import { changePassword } from "@/features/account/actions";
import { fieldClass } from "@/features/auth/components/auth-shell";
import { SubmitButton } from "@/features/auth/components/submit-button";

const messages: Record<string, { role: "alert" | "status"; text: string; className: string }> = {
  "password-updated": {
    role: "status",
    text: "Your password was updated. Your current session remains active.",
    className: "bg-success",
  },
  invalid: {
    role: "alert",
    text: "Use a new 12–72 byte password and enter matching confirmation.",
    className: "bg-error-surface",
  },
  error: {
    role: "alert",
    text: "We couldn’t update your password. Check your current password and try again.",
    className: "bg-error-surface",
  },
  service: {
    role: "alert",
    text: "We couldn’t verify your Florence access. Please try again later.",
    className: "bg-error-surface",
  },
};

export function ChangePasswordForm({ status }: { status?: string }) {
  const message = status ? messages[status] : undefined;
  return (
    <section id="password" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="section-title">Change password</h2>
      <p className="mt-2 text-muted-foreground">Confirm your current password before choosing a new one.</p>
      {message && <p role={message.role} className={`mt-5 rounded-lg p-3 ${message.className}`}>{message.text}</p>}
      <form action={changePassword} className="mt-6 flex max-w-xl flex-col gap-5">
        <label className="flex flex-col gap-2 font-medium">Current password
          <input className={fieldClass} type="password" name="currentPassword" autoComplete="current-password" required maxLength={1024} />
        </label>
        <label className="flex flex-col gap-2 font-medium">New password
          <input className={fieldClass} type="password" name="newPassword" autoComplete="new-password" required minLength={12} maxLength={72} />
        </label>
        <label className="flex flex-col gap-2 font-medium">Confirm new password
          <input className={fieldClass} type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={72} />
        </label>
        <SubmitButton className="w-fit" pendingLabel="Updating password…">Update password</SubmitButton>
      </form>
    </section>
  );
}
