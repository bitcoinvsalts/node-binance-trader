#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:1034d8df27c4601d825bd8f6e8793c379e84e52cc06deb9f8d96720a8821a4b9 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:1034d8df27c4601d825bd8f6e8793c379e84e52cc06deb9f8d96720a8821a4b9 AS build

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