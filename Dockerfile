#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:388b9f14c8eb01f2e90f235d11146c6b7daf2f91301085636c497d948b3b5a9a AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:388b9f14c8eb01f2e90f235d11146c6b7daf2f91301085636c497d948b3b5a9a AS build

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