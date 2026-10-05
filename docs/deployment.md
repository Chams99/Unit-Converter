# Docker and Traefik deployment

Universal Convertal runs as a Next.js web container and a private Fastify API
container. Compose publishes neither container port on the VPS. Traefik serves
units.chames.tn over the existing websecure entrypoint and myresolver
certificate resolver. The /api/ router reaches the web container, where the
Next.js rewrite forwards requests to http://api:8787 on the Compose backend
network.

The API is not attached to the Traefik network. Its ordinary Docker bridge
network permits outbound currency-provider requests, so it must not be marked
internal: true. The web container is attached to both the backend and Traefik
networks.

## First deployment

The VPS needs Git, Docker Engine, Docker Compose v2 with up --wait support,
Bash, and access to the existing Traefik Docker network. The DNS record for
units.chames.tn must point to the VPS, and Traefik must already
provide the websecure entrypoint and myresolver certificate resolver.

Clone the deployment branch and make the local environment file:

~~~sh
git clone --branch monorepo-ui-redesign --single-branch https://github.com/Chams99/Unit-Converter.git convertal
cd convertal
cp .env.deploy.example .env.deploy
nano .env.deploy
~~~

The example is prefilled with CONVERTAL_DOMAIN=units.chames.tn,
TRAEFIK_NETWORK=traefik, TRAEFIK_ENTRYPOINT=websecure, and
TRAEFIK_CERT_RESOLVER=myresolver. Keep the confirmed domain and change the
network value only if this Traefik installation uses a different existing
network. CURRENCYAPI_API_KEY is optional; an empty value selects the no-key
Frankfurter adapter.

Start the app with the deployment helper:

~~~sh
bash scripts/deploy.sh
~~~

The helper checks the domain and rate-limit values, verifies that the Traefik
network exists, validates the rendered Compose configuration, builds both
images, waits up to 120 seconds for container health, and runs
scripts/verify-deployment.mjs inside the web container. The smoke check covers
the public pages, a production JavaScript bundle, API health/readiness, unit
conversion, and a synthetic PNG-to-WebP conversion. It makes no currency
provider request.

Confirm public DNS, TLS, and routing from the VPS:

~~~sh
curl --fail --show-error https://units.chames.tn/
curl --fail --show-error https://units.chames.tn/api/healthz
curl --fail --show-error https://units.chames.tn/api/readyz
~~~

To inspect a failed or unhealthy deployment, use the same Compose project and
environment file:

~~~sh
docker compose --project-name convertal --env-file .env.deploy --file docker-compose.yml ps
docker compose --project-name convertal --env-file .env.deploy --file docker-compose.yml logs --tail=100 web api
~~~

## Updates

After the deployment branch has been pushed, update the VPS checkout and rebuild:

~~~sh
git pull --ff-only origin monorepo-ui-redesign
bash scripts/deploy.sh
~~~

Compose rebuilds and recreates services as needed. A brief interruption can
occur during an update; this setup does not claim zero-downtime deployment.

## Network and resource settings

The higher-priority Traefik router matches Host(units.chames.tn) and
PathPrefix(/api/), then applies a token bucket with a default average of 60
requests per minute and a burst of 20. Its source is Traefik's default
RemoteAddr; the middleware does not trust an arbitrary X-Forwarded-For value.
The bucket is local to each Traefik instance, so multiple instances have
separate limits. If another proxy sits in front of Traefik, configure trusted
forwarded headers at that edge before changing how the API limit identifies
clients. This edge limit does not replace application-level quotas or
authentication if those are added later.

The sample runtime ceilings are 1 GiB for the API and 512 MiB for the web app.
Adjust API_MEMORY_LIMIT and WEB_MEMORY_LIMIT in .env.deploy to match observed
use. These ceilings have not been load-tested. Building on the VPS also needs
temporary disk and memory headroom beyond the running-container limits; the
required VPS capacity has not been measured.

The current deployment also caps API CPU at 1 core and web CPU at 0.5 core,
disables additional swap allowance and core dumps, limits tasks/file descriptors,
and uses read-only application filesystems with bounded RAM-backed scratch
directories. The higher-priority image router adds 6 requests/minute per IP,
a burst of 2, upload/output bounds, and 2 global in-flight uploads. The API adds
global admission and currency-provider quotas, hard image-process cancellation,
and upload deadlines. Existing `.env.deploy` files receive the new defaults
without being overwritten. See [abuse protection](abuse-protection.md) for the
full limits, image retention behavior, tests and operational boundaries.

The shared Traefik must have finite read/write timeouts to close stalled uploads
and slow response readers. Its live settings cannot be changed through
Convertal's labels; the guide includes the relevant static settings to check.
This deployment does not claim to protect against all attacks or network DDoS.

The API image uses pnpm's production-only deploy output for the API and its
workspace dependencies. The web image uses Next.js standalone output with
repo-root tracing and includes its public and .next/static assets. Both images
copy THIRD_PARTY_NOTICES.md so the Bootstrap Icons attribution travels with
the deployed artifacts. NODE_IMAGE can override the default
node:24-bookworm-slim image, including with a digest-pinned reference.
