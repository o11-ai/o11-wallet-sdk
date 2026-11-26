/** Why a wallet sign-in ended without access. cli_login_failed reports the reason; the message is unchanged. */
export type LoginFailureReason = "timeout" | "denied" | "expired" | "network" | "invalid_key" | "card_not_found" | "cancelled"
  | "rate_limited" | "unexpected_address" | "check_failed" | "browser_required";

export class LoginFailedError extends Error {
  constructor(readonly reason: LoginFailureReason, message: string) {
    super(message);
    this.name = "LoginFailedError";
  }
}

/** No saved access and no environment key: the command needs `o11 login` first. */
export class NotLoggedInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotLoggedInError";
  }
}
