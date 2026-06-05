export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkDependencies } = await import("@/lib/youtube/download")
    console.log("[Studio] Checking system dependencies...")
    await checkDependencies()
  }
}
