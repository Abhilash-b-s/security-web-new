#!/bin/bash
# nmap_scan_from_pod.sh
# Read lines: <namespace> <fqdn> <port>
# Runs: kubectl exec -n default kalilinux -- nmap -sV --script ssl-enum-ciphers -p <port> <fqdn>
# - prints raw nmap output live
# - avoids hangs using --host-timeout and --max-retries
# - handles non-TLS ports and host-down cases gracefully
# - outputs single JSON file with accepted/weak/safe ciphers

set -euo pipefail

INPUT_FILE="./k8s-services.txt"
OUTPUT_FILE="./nmap.json"

# Timeout and retry tuning (tweak if needed)
HOST_TIMEOUT="25s"    # skip host if nmap takes longer than this
MAX_RETRIES="1"       # don't retry many times on connection failures

if [ ! -f "$INPUT_FILE" ]; then
  echo "ERROR: input file not found: $INPUT_FILE"
  exit 1
fi

# Collect one JSON object per line, then build the array atomically at the end
ENTRIES_FILE=$(mktemp)
trap 'rm -f "$ENTRIES_FILE"' EXIT

echo "-"
echo "Nmap SSL/TLS Cipher Suite Scanner"
echo

# helper: extract TLS cipher lines, cleaned
parse_ciphers_lines() {
  local raw="$1"
  printf '%s\n' "$raw" | grep -E 'TLS_.*_' | sed 's/|//g' | sed 's/^[[:space:]]*//'
}

# scan one service and append JSON entry
scan_service() {
  local ns="$1"
  local fqdn="$2"
  local port="$3"

  echo
  echo "========================================================================"
  echo "Scanning: $fqdn:$port (namespace: $ns)"

  # run nmap and capture output silently for parsing
  tmp=$(mktemp)
  ( set +e
    nmap -sV --script ssl-enum-ciphers -p "$port" "$fqdn" --host-timeout "$HOST_TIMEOUT" --max-retries "$MAX_RETRIES" > "$tmp" 2>&1
  )
  raw_output=$(cat "$tmp")

  # Parse host status and service info
  local host_ip=$(echo "$raw_output" | grep -oP 'Nmap scan report for .* \(\K[0-9.]+(?=\))' | head -1)
  local service_info=$(echo "$raw_output" | grep -oP '^\d+/tcp\s+\w+\s+\K.*' | head -1)
  local host_status="Unknown"

  # If nmap reports "0 hosts up" or "Host seems down", treat as unreachable
  if printf '%s\n' "$raw_output" | grep -q -E "0 hosts up|Host seems down|All 0 scanned ports on"; then
    host_status="Down/Unreachable"
    echo "  Status: ✗ Host appears down or unreachable"
    accepted_json='[]'
    weak_json='[]'
    safe_json='[]'
  else
    host_status="Up"
    # Show brief status
    if [ -n "$host_ip" ]; then
      echo "  Status: ✓ Host is up (IP: $host_ip)"
    else
      echo "  Status: ✓ Host is up"
    fi

    # Show service info if available
    if [ -n "$service_info" ]; then
      echo "  Service: $service_info"
    fi

    # Extract accepted cipher lines (may be empty)
    mapfile -t cipher_lines < <(parse_ciphers_lines "$raw_output")

    if [ "${#cipher_lines[@]}" -eq 0 ]; then
      echo "  SSL/TLS: No TLS ciphers detected (non-TLS service or closed port)"
      accepted_json='[]'
      weak_json='[]'
      safe_json='[]'
    else
      # Build accepted JSON array
      accepted_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1]')
      weak_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1] | map(select(test("cbc|rc4|3des|des|null|export|md5"; "i")))')
      safe_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1] | map(select(test("cbc|rc4|3des|des|null|export|md5"; "i") | not))')

      # Count ciphers
      local total_ciphers="${#cipher_lines[@]}"
      local weak_count=$(echo "$weak_json" | jq 'length')
      local safe_count=$(echo "$safe_json" | jq 'length')

      echo "  SSL/TLS: Found $total_ciphers cipher(s) - Safe: $safe_count, Weak: $weak_count"

      # Show weak ciphers if any
      if [ "$weak_count" -gt 0 ]; then
        echo "  ⚠ Weak ciphers detected:"
        echo "$weak_json" | jq -r '.[]' | sed 's/^/    - /'
      fi
    fi
  fi

  rm -f "$tmp"

  # write JSON object
  jq -cn \
    --arg ns "$ns" \
    --arg fqdn "$fqdn" \
    --arg port "$port" \
    --argjson accepted "$accepted_json" \
    --argjson weak "$weak_json" \
    --argjson safe "$safe_json" \
    '{namespace: $ns, fqdn: $fqdn, port: ($port | tonumber), accepted_ciphers: $accepted, weak_ciphers: $weak, safe_ciphers: $safe}' >> "$ENTRIES_FILE"

  echo "  ✓ Scan completed for $fqdn:$port"
  echo
}

# read input file lines
while IFS= read -r line || [ -n "$line" ]; do
  # skip blank / commented lines
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  # normalize whitespace and parse fields
  read -r ns fqdn port <<< "$(echo "$line" | tr -s '[:space:]' ' ')"

  if [ -z "${ns:-}" ] || [ -z "${fqdn:-}" ] || [ -z "${port:-}" ]; then
    echo "[!] skipping malformed line: '$line'"
    continue
  fi

  scan_service "$ns" "$fqdn" "$port"
done < "$INPUT_FILE"

# build JSON array; write-then-rename so readers never see a partial file
jq -s . "$ENTRIES_FILE" > "$OUTPUT_FILE.tmp" && mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"

echo
echo "========================================================================"
echo "  All scans complete!"
echo "  Report saved to: $OUTPUT_FILE"
echo "========================================================================"
