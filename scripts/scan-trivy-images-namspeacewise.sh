#!/usr/bin/env bash
# Find all images used by running pods and scan with Trivy.
# Saves JSON reports per namespace under trivy-reports/<namespace>/<sanitized-imagename>.json.
#
# Usage:
#   ./scan-namespace-images.sh [namespace|ALL]
# Defaults:
#   namespace = amcop-system
#   OUTPUT_DIR = trivy-reports
#   TRIVY_FLAGS = "--format json"
#
# Customize severity or other flags by setting TRIVY_FLAGS, e.g.:
#   TRIVY_FLAGS="--format json --severity HIGH,CRITICAL" ./scan-namespace-images.sh

set -u
set -o pipefail

NAMESPACE="${1:-amcop-system}"
OUTPUT_DIR="${OUTPUT_DIR:-trivy-reports}"
TRIVY_FLAGS=${TRIVY_FLAGS:-"--format json --quiet"}

# Dependencies check
if ! command -v kubectl >/dev/null 2>&1; then
  echo "Error: kubectl is not installed or not in PATH" >&2
  exit 1
fi
if ! command -v trivy >/dev/null 2>&1; then
  echo "Error: trivy is not installed or not in PATH" >&2
  echo "Install: https://aquasecurity.github.io/trivy/v0.50/getting-started/installation/" >&2
  exit 1
fi

# ensure base output dir exists
mkdir -p "$OUTPUT_DIR"

# Minimal, highlighted logging (colors only if supported) + helpers
supports_color() {
  [ -n "${NO_COLOR:-}" ] && return 1
  [ -t 1 ] || return 1
  command -v tput >/dev/null 2>&1 || return 1
  local colors term
  colors=$(tput colors 2>/dev/null || echo 0)
  term=${TERM:-}
  [ "$colors" -ge 8 ] || return 1
  [ -n "$term" ] && [ "$term" != "dumb" ] || return 1
  return 0
}

if supports_color; then
  BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; DIM="\033[2m"; RESET="\033[0m"; BG_HEADING="\033[44m"
  USE_COLOR=1
else
  BOLD=""; GREEN=""; CYAN=""; DIM=""; RESET=""; BG_HEADING=""
  USE_COLOR=0
fi

# Center text within terminal width
center_text() {
  local s="$1"
  local cols
  cols=$(tput cols 2>/dev/null || echo 80)
  local len=${#s}
  if [ "$len" -ge "$cols" ]; then
    echo "$s"
    return
  fi
  local pad=$(( (cols - len)/2 ))
  printf "%*s%s%*s\n" "$pad" "" "$s" "$pad" ""
}

# Print centered, bold heading with a subtle background
print_centered_heading() {
  local s="$1"
  if [ "$USE_COLOR" -eq 1 ]; then
    center_text "${BOLD}${BG_HEADING} ${s} ${RESET}"
  else
    center_text "$s"
  fi
}

# Fixed-width key/value printer to align columns
LABEL_WIDTH=10
print_kv(){
  local label="$1"; local value="$2"; local color="$3";
  if [ "$USE_COLOR" -eq 1 ]; then
    printf "%b%-*s%b  : %s\n" "${BOLD}${color}" "$LABEL_WIDTH" "$label" "${RESET}" "$value"
  else
    printf "%-*s  : %s\n" "$LABEL_WIDTH" "$label" "$value"
  fi
}

# Helper: sanitize image string to a safe filename
sanitize() {
  echo "$1" | sed -e 's#/#_#g' -e 's#:#_#g' -e 's#@#_#g' -e 's#[^A-Za-z0-9._-]#_#g'
}

# Pods may use short refs (python:3.11); qualify them the way containerd/registries do.
normalize_image() {
  local img="$1" first="${1%%/*}"
  if [[ "$img" != */* ]]; then
    echo "docker.io/library/$img"
  elif [[ "$first" != *.* && "$first" != *:* && "$first" != localhost ]]; then
    echo "docker.io/$img"
  else
    echo "$img"
  fi
}

# Scan all images in a single namespace and save reports to per-namespace folder
scan_namespace() {
  local ns="$1"
  local ns_out_dir="$OUTPUT_DIR/$ns"
  mkdir -p "$ns_out_dir"
  
  echo -e "${BOLD}[ Namespace: ${ns} — Now Start Scanning ]${RESET}"
  echo

  local pods
  if ! pods=$(kubectl get pods -n "$ns" --field-selector=status.phase=Running \
      -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{range .spec.initContainers[*]}{.image}{"\n"}{end}{range .spec.ephemeralContainers[*]}{.image}{"\n"}{end}{end}'); then
    echo "WARNING: could not list the pods of namespace $ns; its existing reports are kept"
    echo "$ns" >> "$KEEP_NS"
    return 0
  fi
  mapfile -t images < <(printf '%s\n' "$pods" | awk 'NF' | sort -u)

  if [ ${#images[@]} -eq 0 ]; then
    return 0
  fi

  for image in "${images[@]}"; do
    local safe_name out_file
    safe_name=$(sanitize "$image")
    out_file="$ns_out_dir/${safe_name}.json"
    echo "$out_file" >> "$KEEP_FILES"   # an image that runs now keeps its report even if this scan could not refresh it
    
    local ref host
    ref=$(normalize_image "$image"); host=${ref%%/*}
    # FAILED_REGISTRIES (space-separated hosts) is set by the backend when a registry login failed.
    if [[ " ${FAILED_REGISTRIES:-} " == *" $host "* ]]; then
      echo "SKIPPED (registry login failed for $host): $image"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    echo "   Scanning ${image}"
    echo -n "     • Scanning In Progress: "
    
    # Capture stderr to a temp file to show on failure
    local err_log=$(mktemp)
    # Images are pulled from their registry (no access to the node's containerd store);
    # credentials come from the docker config written by the Settings registry logins.
    # Write to a temp file: a failed re-scan must not delete the report of an image that is still running.
    trivy image $TRIVY_FLAGS --image-src remote -o "$out_file.part" "$ref" >"$err_log" 2>&1 &
    local pid=$!
    
    while kill -0 $pid 2>/dev/null; do
      echo -n "."
      sleep 1
    done
    wait $pid
    local ret=$?
    
    # echo "" removed to preventing blank line in UI
    if [ $ret -eq 0 ]; then
      mv -f "$out_file.part" "$out_file"
      echo -e "     ${GREEN}✔${RESET} scanning completed"
      SCANNED=$((SCANNED + 1))
    else
      echo -e "     ${BOLD}✘${RESET} scanning failed"
      echo "SKIPPED (could not pull or scan): $image"
      SKIPPED=$((SKIPPED + 1))
      rm -f "$out_file.part"   # the previous report of this image, if any, stays
      echo -e "${DIM}Error details:${RESET}"
      cat "$err_log"
    fi
    rm -f "$err_log"
  done
}

SCANNED=0
SKIPPED=0

# Reports of images that no longer run are removed at the end of a complete scan (see prune_stale).
KEEP_FILES=$(mktemp); KEEP_NS=$(mktemp)
trap 'rm -f "$KEEP_FILES" "$KEEP_NS"' EXIT

# $1 = directory to clean. Deletes *.json reports there that were not listed for an image running now,
# except in namespaces whose pods could not be listed. Only called after every namespace was processed:
# a scan that is stopped or fails halfway never reaches it, so it cannot leave the report folder empty.
prune_stale() {
  local dir="$1" f ns removed=0
  while IFS= read -r f; do
    ns=$(basename "$(dirname "$f")")
    grep -qxF "$f" "$KEEP_FILES" && continue
    grep -qxF "$ns" "$KEEP_NS" && continue
    rm -f "$f" && removed=$((removed + 1)) && echo "Removed report of an image that is no longer running: ${f#"$OUTPUT_DIR"/}"
  done < <(find "$dir" -mindepth 2 -type f -name '*.json')
  find "$dir" -type f -name '*.json.part' -delete 2>/dev/null   # leftovers of a scan that was stopped
  find "$dir" -mindepth 1 -type d -empty -delete 2>/dev/null
  echo "Stale reports removed: $removed"
}

# Entry
if [[ "${NAMESPACE^^}" == "ALL" ]]; then
  mapfile -t namespaces < <(kubectl get ns -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | awk 'NF' | sort)
  if [ ${#namespaces[@]} -eq 0 ]; then
    echo "No namespaces found."
    exit 1
  fi
  echo
  echo "Trivy image scanning for: ALL namespaces"
  echo
  for ns in "${namespaces[@]}"; do
    [[ "$ns" == sec-nmap-* ]] && continue   # the network scan's own temporary namespace, not part of the cluster
    scan_namespace "$ns"
  done
  if [ $((SCANNED + SKIPPED)) -gt 0 ]; then
    prune_stale "$OUTPUT_DIR"
  else
    echo "No running images found: old reports are left as they are."  # e.g. the API was unreachable
  fi
else
  echo
  echo "Trivy image scanning for: ${NAMESPACE}"
  echo
  scan_namespace "$NAMESPACE"
  echo "Done. Reports saved in '$OUTPUT_DIR/$NAMESPACE/'"
fi

# Coverage line so a drop in scanned images is visible, not silent
echo
echo "Image scan summary: scanned=$SCANNED skipped=$SKIPPED"
