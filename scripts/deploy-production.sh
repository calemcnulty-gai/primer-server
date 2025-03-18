#!/bin/bash
set -e

# This script handles the deployment to the production environment
# It assumes deploy.sh has already been run

echo "Starting deployment to PRODUCTION environment..."
echo "WARNING: You are about to deploy to PRODUCTION!"
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Deployment cancelled."
  exit 1
fi

# Load production environment variables
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
else
  echo "Error: Environment file .env.production not found"
  exit 1
fi

# Verify we're deploying to production
if [ "$NODE_ENV" != "production" ]; then
  echo "Error: NODE_ENV is not set to production"
  exit 1
fi

# Create distribution package
echo "Creating distribution package..."
tar -czf dist.tar.gz dist package.json package-lock.json .env.production

# Deploy command would go here
# Example: scp dist.tar.gz user@production-server:/path/to/app
echo "Simulating deployment to production server..."
echo "scp dist.tar.gz user@production-server:/path/to/app"

# Remote installation commands would go here
# Example: ssh user@production-server "cd /path/to/app && tar -xzf dist.tar.gz && npm ci --production && pm2 restart app"
echo "Simulating remote installation on production server..."
echo "ssh user@production-server \"cd /path/to/app && tar -xzf dist.tar.gz && npm ci --production && pm2 restart app\""

echo "Production deployment complete!" 