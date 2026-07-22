# Firestore Security Specification: Econometrics Lab

## Data Invariants
1. A workspace document must belong to the authenticated user (`/users/{uid}`).
2. Model runs, robustness entries, and reports must be children of the authenticated user's path.
3. Timestamps (`lastUpdated`, `timestamp`) must match the server time on write.
4. Dataset metadata must have a valid structure type.

## The Dirty Dozen Payloads (Rejection Targets)

1. **Identity Spoofing**: Attempt to write to `/users/other_uid/workspace/current`.
2. **Key Injection**: Adding a `isAdmin: true` field to the Workspace document.
3. **Type Poisoning**: Sending `rowCount: "lots"` as a string instead of a number.
4. **Boundary Violation**: Sending a research hypothesis that is 1MB in size.
5. **Orphaned Write**: Creating a model run with an ID that doesn't match the URL path.
6. **Timestamp Faking**: Providing a pre-dated `lastUpdated` field.
7. **Cross-User Leak**: Authenticated User A attempting to list User B's model runs.
8. **Malicious ID**: Using `../` or special characters in `{runId}` to attempt path traversal.
9. **Enum Violation**: Setting `structure` to `galaxy-cluster`.
10. **Partial Update Gap**: Updating only the `notes` but removing the `module` field in a way that breaks invariants.
11. **Denial of Wallet**: Sending a massive array of 10,000 dummy variables in `currentDataset`.
12. **Immutable violation**: Attempting to change the `module` of an existing ModelRun.

## Test Runner (Logic)
The following rules will be tested against these payloads using the Firestore emulator or manual validation logic.
