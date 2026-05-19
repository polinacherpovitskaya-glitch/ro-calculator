#!/usr/bin/env bash
# Provision a fresh Ubuntu 22.04 VPS for ops stack.
# Idempotent: re-running is safe.
#
# Usage (run AS ROOT on the VPS):
#   bash provision-vps.sh
#
# Or remotely from your laptop:
#   scp ops/infra/scripts/provision-vps.sh root@<IP>:/tmp/
#   ssh root@<IP> "bash /tmp/provision-vps.sh"

set -euo pipefail

DEPLOY_USER="ops"
DEPLOY_HOME="/home/${DEPLOY_USER}"
APP_DIR="/srv/ops"

echo "==> Update apt and install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release ufw fail2ban rsync s3cmd \
  postgresql-client-common postgresql-client htop

echo "==> Install Docker (official repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Create deploy user ${DEPLOY_USER}"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

echo "==> Copy root's SSH keys to ${DEPLOY_USER}"
mkdir -p "${DEPLOY_HOME}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "${DEPLOY_HOME}/.ssh/authorized_keys"
fi
chmod 700 "${DEPLOY_HOME}/.ssh"
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys" || true
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"

echo "==> Create app directory ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

echo "==> Configure UFW firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Harden SSH (disable root login, password auth)"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

echo "==> Enable fail2ban"
systemctl enable --now fail2ban

echo "==> Verify"
docker --version
docker compose version
sudo -u "${DEPLOY_USER}" docker ps >/dev/null

echo
echo "Provisioning complete."
echo "Next: log in as ${DEPLOY_USER}@<IP> (NOT root) and continue."
