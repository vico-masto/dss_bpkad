FROM node:20-slim

WORKDIR /app

# Skip puppeteer Chrome download (kita pakai Chromium distro di bawah)
ARG PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=$PUPPETEER_SKIP_DOWNLOAD
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=$PUPPETEER_SKIP_DOWNLOAD

# BACKEND_URL harus tersedia saat BUILD TIME karena rewrites() di next.config.js
# di-resolve ke routes-manifest.json saat `next build`, bukan saat runtime.
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL

# Chromium utk cetak PDF server-side (puppeteer) + font dasar PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build production bundle
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
