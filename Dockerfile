#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:e09a63130ce4ec4b20af5bd07e2029a0ef26f64f1f496f0854f5b1ff1aa69575 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:e09a63130ce4ec4b20af5bd07e2029a0ef26f64f1f496f0854f5b1ff1aa69575 AS build

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-alpine3.13@sha256:ee1c7036d8d2a81557eda8b88ecc797676d1db04bf80e7f826512b12d099ee82 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./