# Abuse protection and image retention

Implemented 2026-10-05. Defaults below describe one API instance and one
Traefik instance. They bound resource use; they do not guarantee availability
against every attack.

## Images and storage

There is no database, object store, upload directory or durable conversion
queue. The API reads one upload into a bounded buffer, sends it to a temporary
child process, and returns the encoded buffer. It never calls multipart's
file-saving helpers or Sharp's file-output methods. Workers receive no currency
credentials, file paths, remote URLs or shell commands. Successful conversions,
errors, cancellation and deadlines all terminate the child before its slot is
released. A separate process is a resource boundary, not a complete security
sandbox for a compromised native decoder.

Both application containers have read-only root filesystems. Required scratch
directories and the Next cache use small tmpfs mounts, not persistent volumes.
Their swap allowance equals their RAM allowance, and core dumps are disabled.
The application does not log uploaded bytes, filenames, input bodies, query
strings or provider credentials. The existing shared Traefik's logs and other
host services remain outside this repository's control. Docker images, build
cache and rotated logs still consume disk; “no saved uploads” is not a host
disk quota or forensic secure-erasure guarantee.

Traefik buffering thresholds are larger than their corresponding allowed body
sizes so these conversion routes do not deliberately spill uploads/results to
proxy disk. Do not lower memory thresholds below the accepted body limits.

## Default limits

| Layer | Default |
| --- | --- |
| Traefik public API | Per RemoteAddr: 60/min average, burst 20 |
| Traefik images | Additional per RemoteAddr: 6/min average, burst 2 |
| Traefik pages/assets | Per RemoteAddr: 240/min average, burst 120 |
| Traefik in-flight requests | Pages 64, ordinary API 32, images 2 |
| API admission, all clients combined | 120/min average, burst 40, at most 32 active requests |
| Image admission, all clients combined | 12/min average, burst 2, at most 2 uploads/conversions |
| Provider calls, all clients combined | 20/min average, burst 5, at most 4 distinct in-flight pairs |
| Currency cache | 256 entries, success at most 60s, failure 10s; same-pair requests coalesce |
| Ordinary API body | 16 KiB |
| Image request/file | Proxy body 10 MiB + 16 KiB multipart overhead; file 10 MiB |
| Multipart fields | One file named `file`; four allowlisted fields, 64 bytes each; repeated fields rejected |
| Image decoded/output | 40 million pixels; encoded output 25 MiB |
| Image deadline | 25s total at API, including upload; 8s child-process lifetime |
| Provider deadline | 3s across headers and bounded response-body reading |
| API HTTP | 10s header deadline; 20s complete-request deadline; 15s inactivity; 5s idle keep-alive |
| Container CPU | API 1 logical CPU, web 0.5 logical CPU |
| Container RAM | API 1 GiB, web 512 MiB, no additional swap allowance |
| Container tasks / file descriptors | API 96 tasks, web 64 tasks; 1024 file descriptors each |
| Scratch memory | `/tmp` 16 MiB per container; Next cache 32 MiB |
| Docker logs | At most three 10 MB files per application service |

Token buckets refill continuously; these are average rates and burst capacities,
not fixed calendar-minute counters. Rate-limited application responses include
`Retry-After`. Proxy responses may be plain text; clients must handle both.
Image output size is checked after native encoding, so the container RAM ceiling
remains the final guard against native allocation. Reaching it may cause an OOM
restart and failed requests, rather than a graceful 413. CPU limits throttle
work; they do not reserve CPU or RAM away from other VPS services.

Traefik uses its connection's RemoteAddr for per-IP buckets. No user-supplied
forwarded header or device cookie identifies a rate-limit subject. NAT users
share an allowance; VPN/IP rotation can evade the IP bucket. Global API,
provider and image budgets remain in effect across changing IPs. Concurrency
grouping uses a fixed header overwritten by an earlier middleware, so a client
cannot create extra groups by supplying its own header or changing Host ports.
Buckets reset on restart and are not shared across replicas. Introduce shared
limits and authenticated quotas before scaling beyond one instance.

## Shared proxy and VPS requirements

The production Traefik is shared with the portfolio and is not changed by this
deployment. Its static configuration must keep a finite whole-request read
timeout. Traefik v3.1 defaults to 60s; setting it to zero removes this protection.
Slow response readers also need a finite write timeout. A suitable starting
configuration for small uploads is:

```text
--entrypoints.websecure.transport.respondingtimeouts.readtimeout=30s
--entrypoints.websecure.transport.respondingtimeouts.writetimeout=60s
--entrypoints.websecure.transport.respondingtimeouts.idletimeout=30s
```

These flags belong to the existing Traefik service, not Convertal's containers.
Inspect that service and check the impact on its other routes before changing
it; do not recreate the shared proxy from this application's Compose file.
The API's own timers start after proxy buffering, so they cannot replace
Traefik's upload timeout. Keep Docker/API host ports private and the VPS firewall
restricted to needed public services. Do not expose Docker's management socket
or Traefik's administrative dashboard publicly.

Application controls do not stop bandwidth saturation, TLS/connection floods,
large botnets or unknown vulnerabilities. Provider/network DDoS protection and,
where appropriate, a CDN/WAF with correctly trusted proxy addresses are the
next layer. Do not blindly switch to arbitrary X-Forwarded-For headers. Disk
usage, OOM/restart counts, CPU and 429/413 rates need operational monitoring.
Sustained production load and the live shared proxy settings were not measured
by these repository tests.

## Verification

Tests cover bounded bursts, global budgets despite spoofed headers, slow uploads,
disconnect cleanup, upload deadlines, hard termination of an unresponsive image
process, real image output, provider de-duplication, failure caching, call quotas,
stalled response bodies, malformed data and raster-signature rejection.
Linux CI starts the read-only production containers with CPU/RAM/task ceilings,
checks their actual Docker settings, runs production conversion smoke checks,
and tests body limits and rate limiting through an isolated Traefik proxy. Its
self-signed TLS certificate is accepted only inside that private CI test.

References:

- [Fastify server limits](https://fastify.dev/docs/latest/Reference/Server/), checked against installed 5.12.5 documentation.
- [Node child process termination](https://nodejs.org/docs/latest-v24.x/api/child_process.html).
- [Traefik rate limiting](https://doc.traefik.io/traefik/v3.1/middlewares/http/ratelimit/).
- [Traefik concurrency](https://doc.traefik.io/traefik/v3.1/middlewares/http/inflightreq/).
- [Traefik buffering](https://doc.traefik.io/traefik/v3.1/middlewares/http/buffering/).
- [Traefik entrypoint timeouts](https://doc.traefik.io/traefik/v3.1/routing/entrypoints/#respondingtimeouts).
- [Docker Compose resource and filesystem settings](https://docs.docker.com/reference/compose-file/services/).
