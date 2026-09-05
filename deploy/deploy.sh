#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a 40-character Git commit SHA." >&2
  exit 2
fi

app_root="$HOME/English_Context"
incoming="$app_root/incoming"
releases="$app_root/releases"
archive="$incoming/$release_id.tar.gz"
release="$releases/$release_id"
current="$app_root/current"
next_link="$app_root/.current-$release_id"
unit_name="english-context.service"
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/$unit_name"
previous=""

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"

[[ -f "$archive" ]] || { echo "Release archive not found: $archive" >&2; exit 1; }

mkdir -p "$release" "$unit_dir"
tar -xzf "$archive" -C "$release"
[[ -f "$release/server.js" ]] || { echo "Release does not contain server.js" >&2; exit 1; }
[[ -f "$release/deploy/$unit_name" ]] || { echo "Release does not contain $unit_name" >&2; exit 1; }

environment_found=false
for environment_file in .env .env.local .env.production .env.production.local; do
  if [[ -f "$app_root/$environment_file" ]]; then
    ln -sfn "$app_root/$environment_file" "$release/$environment_file"
    environment_found=true
  fi
done
[[ "$environment_found" == true ]] || { echo "No runtime environment file found in $app_root" >&2; exit 1; }

if [[ -L "$current" ]]; then
  previous="$(readlink -f "$current")"
fi
if [[ -f "$unit_file" ]]; then
  cp "$unit_file" "$release/previous.service"
fi

rollback() {
  echo "Restoring the previous release." >&2
  if [[ -n "$previous" ]]; then
    ln -sfn "$previous" "$next_link"
    mv -Tf "$next_link" "$current"
  elif [[ -f "$release/previous.service" ]]; then
    rm -f "$current"
    cp "$release/previous.service" "$unit_file"
  fi
  systemctl --user daemon-reload || true
  systemctl --user restart "$unit_name" || true
  journalctl --user -u "$unit_name" -n 50 --no-pager >&2 || true
}

ln -sfn "$release" "$next_link"
mv -Tf "$next_link" "$current"
install -m 0644 "$release/deploy/$unit_name" "$unit_file"
if ! systemctl --user daemon-reload || ! systemctl --user restart "$unit_name"; then
  rollback
  exit 1
fi

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:3456/" >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "Health check failed." >&2
  rollback
  exit 1
fi

rm -f "$archive"
echo "Deployed $release_id successfully."
