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

# Scan all images in a single namespace and save reports to per-namespace folder
scan_namespace() {
  local ns="$1"
  local ns_out_dir="$OUTPUT_DIR/$ns"
  mkdir -p "$ns_out_dir"
  
  echo -e "${BOLD}[ Namespace: ${ns} — Now Start Scanning ]${RESET}"
  echo

  mapfile -t images < <(
    kubectl get pods -n "$ns" --field-selector=status.phase=Running \
      -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{range .spec.initContainers[*]}{.image}{"\n"}{end}{range .spec.ephemeralContainers[*]}{.image}{"\n"}{end}{end}' \
    | awk 'NF' \
    | sort -u
  )

  if [ ${#images[@]} -eq 0 ]; then
    return 0
  fi

  for image in "${images[@]}"; do
    local safe_name out_file
    safe_name=$(sanitize "$image")
    out_file="$ns_out_dir/${safe_name}.json"
    
    echo "   Scanning ${image}"
    echo -n "     • Scanning In Progress: "
    
    # Capture stderr to a temp file to show on failure
    local err_log=$(mktemp)
    trivy image $TRIVY_FLAGS -o "$out_file" "$image" >"$err_log" 2>&1 &
    local pid=$!
    
    while kill -0 $pid 2>/dev/null; do
      echo -n "."
      sleep 1
    done
    wait $pid
    local ret=$?
    
    # echo "" removed to preventing blank line in UI
    if [ $ret -eq 0 ]; then
      echo -e "     ${GREEN}✔${RESET} scanning completed"
    else
      echo -e "     ${BOLD}✘${RESET} scanning failed"
      echo -e "${DIM}Error details:${RESET}"
      cat "$err_log"
    fi
    rm -f "$err_log"
  done
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
    scan_namespace "$ns"
  done
else
  echo
  echo "Trivy image scanning for: ${NAMESPACE}"
  echo
  scan_namespace "$NAMESPACE"
  echo "Done. Reports saved in '$OUTPUT_DIR/$NAMESPACE/'"
fi
