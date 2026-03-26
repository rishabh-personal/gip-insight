# Deployment Setup

## Step 1 — Push code to GitHub
Create a GitHub repo and push the codebase:

```bash
git init
git remote add origin https://github.com/YOUR_ORG/gip-insight.git
git add .
git commit -m "initial commit"
git push -u origin main
```

---

## Step 2 — Add GitHub Secrets
Go to `Settings → Secrets and variables → Actions → New repository secret` and add:

| Secret | Description |
|---|---|
| `DOCKER_HUB_USERNAME` | Docker Hub username (e.g. `rishabhpersonal`) |
| `DOCKER_HUB_TOKEN` | Docker Hub access token (not your password) |
| `DROPLET_HOST` | Public IP of the DigitalOcean droplet |
| `DROPLET_SSH_KEY` | Private key GitHub Actions uses to SSH into the droplet |
| `PROD_ENV` | Full contents of the production `.env` (use `.env.production.example` as template) |

> `PROD_ENV` is written to `/opt/gip-insight/.env` on every deploy, so rotating
> a credential or adding a variable only requires updating this secret — no manual SSH needed.

---

## Step 3 — Trigger the first build
Push any commit (or re-run the workflow manually) to trigger GitHub Actions.
This builds both Docker images and pushes them to Docker Hub.

```bash
git commit --allow-empty -m "trigger first build"
git push
```

Wait for the Actions run to finish — you can watch it at `github.com/YOUR_ORG/gip-insight/actions`.

---

## Step 4 — One-time droplet setup
SSH into the droplet and prepare the directory:

```bash
# Create working directory
mkdir -p /opt/gip-insight

# Place the SSH tunnel key (used by the API to reach jh.ginesys.one)
nano /opt/gip-insight/tunnel_key    # paste the private key
chmod 600 /opt/gip-insight/tunnel_key
```

> The `tunnel_key` is intentionally kept on the droplet's filesystem only —
> it is NOT managed through GitHub and never passes through CI.

---

## Step 5 — Bootstrap first container run
Copy `docker-compose.yml` from your local machine to the droplet, then start the containers:

```bash
# From your local machine
scp docker-compose.yml root@YOUR_DROPLET_IP:/opt/gip-insight/

# On the droplet — .env was already written by the GitHub Actions run in step 3
docker compose -f /opt/gip-insight/docker-compose.yml pull
docker compose -f /opt/gip-insight/docker-compose.yml up -d
```

---

From this point, every push to `main` automatically:
1. Builds and pushes new Docker images
2. Writes the latest `PROD_ENV` secret to `/opt/gip-insight/.env`
3. SCPs the latest `docker-compose.yml`
4. Pulls new images and restarts containers on the droplet
