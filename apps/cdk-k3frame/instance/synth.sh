#!/bin/bash
set -e

# Default to k3frame profile for AWS lookups
export AWS_PROFILE="${AWS_PROFILE:-k3frame}"
export AWS_DEFAULT_PROFILE="${AWS_DEFAULT_PROFILE:-$AWS_PROFILE}"

# Set CDK_DEFAULT_ACCOUNT if not already set
if [ -z "$CDK_DEFAULT_ACCOUNT" ]; then
  CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
fi

# Set CDK_DEFAULT_REGION if not already set
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-us-east-1}"

# Validate account is set
if [ -z "$CDK_DEFAULT_ACCOUNT" ]; then
  echo "Error: CDK_DEFAULT_ACCOUNT is required. Set it via environment variable or ensure AWS credentials are configured." >&2
  exit 1
fi

export CDK_DEFAULT_ACCOUNT

# Build CDK context arguments
CDK_CONTEXT_ARGS=""
if [ -n "$DOMAIN" ]; then
  CDK_CONTEXT_ARGS="$CDK_CONTEXT_ARGS --context domain=$DOMAIN"
fi
if [ -n "$INSTANCE_DNS" ]; then
  CDK_CONTEXT_ARGS="$CDK_CONTEXT_ARGS --context instanceDns=$INSTANCE_DNS"
fi
if [ -n "$CORE_PARAM_PREFIX" ]; then
  CDK_CONTEXT_ARGS="$CDK_CONTEXT_ARGS --context coreParamPrefix=$CORE_PARAM_PREFIX"
fi

# Run CDK synth
cdk synth $CDK_CONTEXT_ARGS
