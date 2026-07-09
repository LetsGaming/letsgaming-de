# Operations

Running letsgaming.de in production: a homelab, Docker, behind a reverse proxy.

- [deployment](./deployment.md) is configure, build, run, and put TLS in front.
- [analytics-ingestion](./analytics-ingestion.md) is getting traffic stats from
  your reverse-proxy log into the store, including when the proxy runs on another
  host.
- [backups](./backups.md) is backing up and restoring the store volume, which is
  the only thing that can't be rebuilt from the repo.
- [troubleshooting](./troubleshooting.md) is the things that go wrong and what
  they mean.
