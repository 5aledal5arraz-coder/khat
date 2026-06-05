/**
 * PM2 ecosystem for Khat Podcast / Khat Brain.
 *
 * Two long-running processes:
 *   - khat        : Next.js web server (production)
 *   - khat-worker : Postgres-backed jobs worker (lib/jobs/worker.ts).
 *                   In P2.1.f the worker also bootstraps the
 *                   ai-runs-sweeper recurring schedule.
 *
 * P2.2 changes (log-path consolidation only — process shape unchanged):
 *   - Log files moved to /var/log/khat/ for standard Unix conventions.
 *   - Operator setup: mkdir -p /var/log/khat
 *   - Operational runbook: docs/worker-runbook.md
 *
 * Cron-style triggers (discovery sweep, YouTube performance refresh,
 * ai-runs-sweeper) are now driven by the worker's own schedule
 * bootstraps (lib/jobs/scheduler-bootstrap.ts) and do not need a host
 * crontab.
 *
 * Usage on the DigitalOcean droplet:
 *   mkdir -p /var/log/khat                  # one-time
 *   pm2 start ecosystem.config.js           # start everything
 *   pm2 restart khat                        # web only
 *   pm2 restart khat-worker                 # worker only
 *   pm2 logs khat-worker                    # tail worker logs
 *   pm2 save                                # persist across reboots
 *   pm2 startup                             # enable boot-time autostart
 */

module.exports = {
  apps: [
    {
      name: "khat",
      cwd: "/root/khat",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        // Cleanup Phase A — default-on. Set "false" to opt out.
        PREP_V2_ENABLED: "true",
        KHAT_HYBRID_TOPICS_ENABLED: "true",
      },
      out_file: "/var/log/khat/web.out.log",
      error_file: "/var/log/khat/web.err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "khat-worker",
      cwd: "/root/khat",
      script: "npx",
      args: "tsx lib/jobs/worker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "768M",
      // Workers should restart promptly on crash, but back off on persistent failure.
      min_uptime: "30s",
      max_restarts: 20,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
        WORKER_POLL_MS: "2000",
        WORKER_LEASE_MS: "300000",
        // Cleanup Phase A — same defaults as the web process so
        // background prep-conversion jobs run the new pipeline.
        PREP_V2_ENABLED: "true",
        KHAT_HYBRID_TOPICS_ENABLED: "true",
      },
      out_file: "/var/log/khat/worker.out.log",
      error_file: "/var/log/khat/worker.err.log",
      merge_logs: true,
      time: true,
    },
  ],
}
