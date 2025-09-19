Reverse Proxy options (port 80 → 4000)

1) Nginx (recommended)

- Install Nginx (Ubuntu/Debian):
  sudo apt-get update && sudo apt-get install -y nginx

- Copy the provided config and enable it:
  sudo cp ./deploy/nginx/upsuider-backend.conf /etc/nginx/sites-available/upsuider-backend
  sudo ln -s /etc/nginx/sites-available/upsuider-backend /etc/nginx/sites-enabled/upsuider-backend
  # optional: disable the default site if it exists
  sudo rm -f /etc/nginx/sites-enabled/default

- Test and reload Nginx:
  sudo nginx -t && sudo systemctl reload nginx

Notes:
- Replace `server_name _;` with your domain if you have one.
- Ensure your app listens on 0.0.0.0:4000 (default in src/index.ts).
- Open firewall for port 80 if UFW/iptables is enabled.

2) iptables (no extra packages)

- Temporary NAT redirect rule (non-persistent):
  sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 4000
  # optional: redirect local requests to :80 too
  sudo iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-ports 4000

- To persist across reboot (Ubuntu/Debian):
  sudo apt-get install -y iptables-persistent
  sudo netfilter-persistent save

Security note:
- If using iptables forwarding, consider blocking external access to :4000 so traffic goes through :80 only.

