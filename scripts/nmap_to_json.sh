#!/bin/bash
# nmap-scan-to-json.sh
# Read lines: <namespace> <fqdn> <port>
# Runs: nmap -sV --script ssl-enum-ciphers -p <port> <fqdn>
# - prints raw nmap output live
# - avoids hangs using --host-timeout and --max-retries
# - handles non-TLS ports and host-down cases gracefully
# - outputs single JSON file with accepted/weak/safe ciphers

set -euo pipefail

INPUT_FILE="./k8s-services.txt"
OUTPUT_FILE="./nmap.json"

# Timeout and retry tuning (tweak if needed)
HOST_TIMEOUT="15s"    # skip host if nmap takes longer than this
MAX_RETRIES="1"       # don't retry many times on connection failures

if [ ! -f "$INPUT_FILE" ]; then
  echo "ERROR: input file not found: $INPUT_FILE"
  exit 1
fi

if ! command -v nmap >/dev/null 2>&1; then
  echo "ERROR: nmap not found. Install nmap and retry."
  exit 1
fi

echo "[" > "$OUTPUT_FILE"
first_entry=true

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
  echo "================================================================="
  echo "[*] Scanning: $fqdn:$port"
  echo "Command: nmap -sV --script ssl-enum-ciphers -p $port $fqdn --host-timeout $HOST_TIMEOUT --max-retries $MAX_RETRIES"
  echo "================================================================="
  echo

  # run nmap and capture output; show it live to terminal
  # use a temp file so we can both stream and parse reliably
  tmp=$(mktemp)
  # run with host-timeout and low retries to avoid long hangs
  ( set +e
    nmap -sV --script ssl-enum-ciphers -p "$port" "$fqdn" --host-timeout "$HOST_TIMEOUT" --max-retries "$MAX_RETRIES" 2>&1 | tee "$tmp"
  )
  raw_output=$(cat "$tmp")

  # If nmap reports "0 hosts up" or "Host seems down", treat as unreachable
  if printf '%s\n' "$raw_output" | grep -q -E "0 hosts up|Host seems down|All 0 scanned ports on"; then
    echo "[!] $fqdn appears down or not reachable on port $port (nmap reported host down / no ports up)."
    accepted_json='[]'
    weak_json='[]'
    safe_json='[]'
  else
    # Extract accepted cipher lines (may be empty)
    mapfile -t cipher_lines < <(parse_ciphers_lines "$raw_output")

    if [ "${#cipher_lines[@]}" -eq 0 ]; then
      # no TLS ciphers reported (port not TLS or nmap didn't find any) -> empty arrays
      accepted_json='[]'
      weak_json='[]'
      safe_json='[]'
    else
      # Build accepted JSON array
      # Use jq to safely create JSON arrays from lines
      accepted_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1]')

      # weak: those matching legacy patterns
      weak_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1] | map(select(test("cbc|rc4|3des|des|null|export|md5"; "i")))')

      # safe: accepted minus weak
      safe_json=$(printf '%s\n' "${cipher_lines[@]}" | jq -R -s 'split("\n")[:-1] | map(select(test("cbc|rc4|3des|des|null|export|md5"; "i") | not))')
    fi
  fi

  rm -f "$tmp"

  # append comma if needed
  if [ "$first_entry" = true ]; then
    first_entry=false
  else
    echo "," >> "$OUTPUT_FILE"
  fi

  # write JSON object
  jq -n \
    --arg ns "$ns" \
    --arg fqdn "$fqdn" \
    --arg port "$port" \
    --argjson accepted "$accepted_json" \
    --argjson weak "$weak_json" \
    --argjson safe "$safe_json" \
    '{namespace: $ns, fqdn: $fqdn, port: ($port | tonumber), accepted_ciphers: $accepted, weak_ciphers: $weak, safe_ciphers: $safe}' >> "$OUTPUT_FILE"

  echo
  echo "[*] Finished: $fqdn:$port"
  echo "-----------------------------------------------------------------"
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

# close JSON array
echo "]" >> "$OUTPUT_FILE"

echo
echo "[*] All scans complete. JSON output saved to: $OUTPUT_FILE"
