#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/docker-compose.yml"
env_file="$repo_root/.env.deploy"

usage() {
  cat <<'HELP'
Usage: bash scripts/deploy.sh [--env-file PATH] [--compose PATH]

Builds and starts the Convertal web/API stack, waits for health checks, then
runs the local production smoke script inside the web container.
HELP
}

while (($#)); do
  case "$1" in
    --env-file)
      if (($# < 2)); then
        usage >&2
        exit 2
      fi
      env_file="$2"
      shift 2
      ;;
    --compose)
      if (($# < 2)); then
        usage >&2
        exit 2
      fi
      compose_file="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$PWD" "$1" ;;
  esac
}

env_file="$(resolve_path "$env_file")"
compose_file="$(resolve_path "$compose_file")"

if [[ ! -f "$env_file" ]]; then
  printf 'Deployment environment file not found: %s\n' "$env_file" >&2
  printf 'Copy .env.deploy.example to .env.deploy and set the deployment values first.\n' >&2
  exit 1
fi

if [[ ! -f "$compose_file" ]]; then
  printf 'Compose file not found: %s\n' "$compose_file" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local current value

  while IFS='=' read -r current value || [[ -n "$current" ]]; do
    current="${current//[[:space:]]/}"
    [[ "$current" == "$key" ]] || continue
    value="${value%%#*}"
    value="${value//[[:space:]]/}"
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"
    printf '%s' "$value"
    return 0
  done < "$env_file"
}

domain="${CONVERTAL_DOMAIN:-$(read_env_value CONVERTAL_DOMAIN)}"
if [[ -z "$domain" ]]; then
  printf 'CONVERTAL_DOMAIN is required in %s.\n' "$env_file" >&2
  exit 1
fi
if [[ "$domain" == example.com || "$domain" == *.example.com ]]; then
  printf 'Replace the example domain with the confirmed deployment domain.\n' >&2
  exit 1
fi
if [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
  printf 'CONVERTAL_DOMAIN must be a valid DNS hostname; received: %s\n' "$domain" >&2
  exit 1
fi

traefik_network="${TRAEFIK_NETWORK:-$(read_env_value TRAEFIK_NETWORK)}"
traefik_network="${traefik_network:-traefik}"
api_rate_average="${API_RATE_AVERAGE:-$(read_env_value API_RATE_AVERAGE)}"
api_rate_average="${api_rate_average:-60}"
api_rate_period="${API_RATE_PERIOD:-$(read_env_value API_RATE_PERIOD)}"
api_rate_period="${api_rate_period:-1m}"
api_rate_burst="${API_RATE_BURST:-$(read_env_value API_RATE_BURST)}"
api_rate_burst="${api_rate_burst:-20}"

if [[ ! "$api_rate_average" =~ ^[1-9][0-9]*$ || ! "$api_rate_burst" =~ ^[1-9][0-9]*$ ]]; then
  printf 'API_RATE_AVERAGE and API_RATE_BURST must be positive integers.\n' >&2
  exit 1
fi
if [[ ! "$api_rate_period" =~ ^[1-9][0-9]*(ms|s|m|h)$ ]]; then
  printf 'API_RATE_PERIOD must be a positive duration such as 1m or 30s.\n' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required on the deployment host.\n' >&2
  exit 1
fi
docker compose version >/dev/null
docker info >/dev/null

compose=(
  docker compose
  --project-name convertal
  --project-directory "$repo_root"
  --file "$compose_file"
  --env-file "$env_file"
)

"${compose[@]}" config --quiet
if ! docker network inspect "$traefik_network" >/dev/null; then
  printf 'Traefik network "%s" does not exist. Create or select the existing shared network first.\n' "$traefik_network" >&2
  exit 1
fi

printf 'Building and starting Convertal for https://%s\n' "$domain"
"${compose[@]}" up --build --detach --wait --wait-timeout 120

smoke_script="$repo_root/scripts/verify-deployment.mjs"
if [[ ! -f "$smoke_script" ]]; then
  printf 'Deployment smoke script not found: %s\n' "$smoke_script" >&2
  exit 1
fi
"${compose[@]}" exec -T web node --input-type=module < "$smoke_script"

printf 'Container health and conversion smoke checks passed. Public URL: https://%s\n' "$domain"
