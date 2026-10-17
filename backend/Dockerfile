FROM node:22-alpine AS build

RUN apk add --no-cache vips-dev

WORKDIR /opt/app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /opt/app

ENV NODE_ENV=production

COPY --from=build --chown=node:node /opt/app ./

USER node

EXPOSE 1337

CMD ["npm", "run", "start"]