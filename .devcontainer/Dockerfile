FROM node:lts

# Install basic development tools
RUN apt-get update && apt-get install -y \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Ensure default `node` user has access to `sudo`
ARG USERNAME=node
RUN apt-get update \
    && apt-get install -y sudo \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

ENV NODE_ENV=development

# Set the default user
USER node

EXPOSE 3000

# Set working directory
WORKDIR /app

# Download AWS DocumentDB certificate bundle
RUN wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# Set the working directory
WORKDIR /workspace