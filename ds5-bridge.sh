#!/bin/sh
cd "$(dirname "$(realpath "$0")")/ds5-bridge/companion" && exec npx electron .
