/**
 * Safely consumes or cancels the response body to return the underlying
 * socket back to the connection pool immediately.
 * Safe to call multiple times or on already consumed / null bodies.
 */
export async function drain(res: Response | null | undefined): Promise<void> {
  if (!res || !res.body) {
    return;
  }
  if (res.bodyUsed) {
    return;
  }
  if ((res.body as any).locked) {
    throw new TypeError("Cannot drain a locked response body");
  }
  try {
    await res.body.cancel();
  } catch (err: any) {
    if (err instanceof TypeError && (res.body as any).locked) {
      throw err;
    }
    // Suppress cancellation errors on already closed/aborted streams
  }
}
