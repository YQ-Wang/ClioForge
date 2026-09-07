// Keep independent maintenance work moving without hiding failed operations.
export async function runMaintenanceSteps(
  steps: { name: string; run: () => Promise<unknown> }[],
) {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch {
      // Operation names are safe to log; raw errors may contain user data.
      failed.push(step.name);
    }
  }
  if (failed.length)
    throw new Error(`Background maintenance failed: ${failed.join(', ')}`);
}
