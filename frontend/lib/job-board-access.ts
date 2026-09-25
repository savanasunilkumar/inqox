const OWNER_ACCOUNT_ID = "user_3JkI1R3z4G6TD1RBfvl6tqJTHkg";
const ALLOWED_EMAILS = new Set(["savanasuneelkumar@gmail.com"]);

export type UserLike = {
  id?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
};

export function hasJobBoardPreviewAccess(
  userOrIdOrEmail: string | UserLike | null | undefined
): boolean {
  if (!userOrIdOrEmail) return false;

  if (typeof userOrIdOrEmail === "string") {
    const trimmed = userOrIdOrEmail.trim();
    if (trimmed === OWNER_ACCOUNT_ID) return true;
    if (ALLOWED_EMAILS.has(trimmed.toLowerCase())) return true;
    return false;
  }

  if (typeof userOrIdOrEmail === "object") {
    if (userOrIdOrEmail.id && hasJobBoardPreviewAccess(userOrIdOrEmail.id)) {
      return true;
    }
    const primary = userOrIdOrEmail.primaryEmailAddress?.emailAddress;
    if (primary && hasJobBoardPreviewAccess(primary)) {
      return true;
    }
    if (
      userOrIdOrEmail.emailAddresses?.some(
        (entry) => entry?.emailAddress && hasJobBoardPreviewAccess(entry.emailAddress)
      )
    ) {
      return true;
    }
  }

  return false;
}

export function isJobBoardRoute(pathname: string) {
  return pathname === "/job-board" || pathname.startsWith("/job-board/");
}

