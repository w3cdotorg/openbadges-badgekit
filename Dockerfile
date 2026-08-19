FROM node:26-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3000/ || exit 1
CMD ["sh", "-c", "node bin/db-migrate up && node app"]
