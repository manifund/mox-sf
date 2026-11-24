#!/usr/bin/env bash
set -Eeuo pipefail

WIFI_DEVICE="${TESSAVISION_WIFI_DEVICE:-wlan0}"
WIFI_CONNECTION="${TESSAVISION_WIFI_CONNECTION:-Mox-dongle}"

state="$(nmcli -g GENERAL.STATE device show "$WIFI_DEVICE" 2>/dev/null || true)"
case "$state" in
  # Do not restart association, authentication, or DHCP already in progress.
  40*|50*|60*|70*|80*|90*|100*) exit 0 ;;
  '')
    echo "$WIFI_DEVICE is unavailable; leaving other saved Wi-Fi profiles to autoconnect"
    exit 0
    ;;
esac

echo "$WIFI_DEVICE is not connected (state: ${state:-unknown}); reconnecting"
rfkill unblock wifi
nmcli radio wifi on
nmcli device set "$WIFI_DEVICE" managed yes
nmcli --wait 45 connection up "$WIFI_CONNECTION" ifname "$WIFI_DEVICE"
