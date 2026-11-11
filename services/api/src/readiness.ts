export async function waitForHealth(
  base: string,
  expectedVersion: string,
  timeoutMs = 30000,
  intervalMs = 200,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(base + "/health", {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(1000, Math.ceil(deadline - performance.now()))),
        ),
        redirect: "error",
      });
      if (response.ok) {
        const body = (await response.json()) as {
          status?: string;
          version?: string;
          provider?: string;
        };
        if (
          body.status === "ok" &&
          body.version === expectedVersion &&
          body.provider === "mock"
        )
          return;
      }
    } catch {
      /* Do not expose response bodies, network configuration or raw errors. */
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(intervalMs, Math.max(0, deadline - performance.now())),
      ),
    );
  }
  throw new Error("PILOT_READINESS_TIMEOUT");
}
