#!/bin/bash

# Script to execute all security scans in parallel

set -e

SEPARATOR="================================================================================"
SUB_SEPARATOR="--------------------------------------------------------------------------------"

echo ""
echo "$SEPARATOR"
echo "                       Starting Parallel Security Scans"
echo "$SEPARATOR"
echo ""

# Run scripts in parallel
./run1.sh &
PID1=$!
echo "Started run1.sh (PID: $PID1)"

./run2.sh &
PID2=$!
echo "Started run2.sh (PID: $PID2)"

./run3.sh &
PID3=$!
echo "Started run3.sh (PID: $PID3)"

./run4.sh &
PID4=$!
echo "Started run4.sh (PID: $PID4)"

# Wait for all background processes to complete
echo ""
echo "$SUB_SEPARATOR"
echo ">>> Waiting for all scans to complete..."
echo "$SUB_SEPARATOR"
wait $PID1 $PID2 $PID3 $PID4
echo ""

echo "$SEPARATOR"
echo "                       All Parallel Security Scans Complete"
echo "$SEPARATOR"
echo ""
