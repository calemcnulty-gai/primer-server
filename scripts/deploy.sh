#!/bin/bash
set -e

# Get environment from command line argument
ENV=${1:-development}

echo "Usage: ./deploy.sh [environment]"
echo "environment: development (default) or production"

# Validate environment
if [[ "$ENV" != "development" && "$ENV" != "production" ]]; then
  echo "Error: Invalid environment. Must be 'development' or 'production'"
  exit 1
fi

echo "Deploying for $ENV environment..."

# Load environment variables
if [ -f .env.$ENV ]; then
  export $(grep -v '^#' .env.$ENV | xargs)
else
  echo "Error: Environment file .env.$ENV not found"
  exit 1
fi

# Verify required environment variables
if [ -z "$NODE_ENV" ]; then
  echo "Error: NODE_ENV not set in .env.$ENV"
  exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm ci

# Run tests
echo "Running tests..."
npm test

# Build application
echo "Building application..."
npm run build

echo "Deployment preparation complete!"
echo "To complete deployment, run: ./scripts/deploy-$ENV.sh" 