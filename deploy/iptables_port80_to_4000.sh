#!/usr/bin/env bash
set -euo pipefail

echo "[+] Redirecting TCP :80 -> :4000 (PREROUTING)" >&2
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 4000

echo "[+] Redirecting local TCP :80 -> :4000 (OUTPUT on loopback)" >&2
sudo iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-ports 4000 || true

echo "[i] Rules added. To persist across reboots on Debian/Ubuntu:" >&2
echo "    sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save" >&2

