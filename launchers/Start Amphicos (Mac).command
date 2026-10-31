#!/bin/bash
# Amphicos 3D Platform, offline edition. Opens the platform in Google Chrome (or the default browser).
# First time only: right-click this file, choose Open, then Open again (macOS asks once for files from the internet).
cd "$(dirname "$0")" || exit 1
APP="$(pwd)/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --new-window --start-fullscreen "$APP"
else
  open "$APP"
fi
