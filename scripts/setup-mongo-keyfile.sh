#!/bin/sh
set -eu

KEYFILE="docker/mongo-keyfile"

umask 177
openssl rand -base64 756 > "$KEYFILE"
chmod 400 "$KEYFILE"

echo "Generated $KEYFILE with permission 400"
