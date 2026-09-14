export const normalizeRenderFailure = (reason: unknown): unknown =>
  reason === null || reason === undefined
    ? new Error("Rendering failed without an error reason")
    : reason;
