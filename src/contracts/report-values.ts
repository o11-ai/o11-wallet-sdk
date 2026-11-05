// Plain value lists so clients can validate URLs without loading the full schemas.
export const reportKinds = ["feedback", "dispute"] as const;
export const reportStatuses = ["open", "in_review", "needs_info", "resolved", "dismissed"] as const;
