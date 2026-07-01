export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate config at boot: warn on missing recommended service keys, log
    // (not throw) on missing required config so the server still starts and can
    // render error pages. The worker fails hard on the same check instead.
    const { validateEnv } = await import("@/lib/env")
    validateEnv({ throwOnRequired: false })

    const { checkDependencies } = await import("@/lib/youtube/download")
    console.log("[Studio] Checking system dependencies...")
    await checkDependencies()
  }
}
