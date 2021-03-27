#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:ba19b03b1bc61ea8caf51a104a51228f21c1819d1d8e2177effe0160e9710bab AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:ba19b03b1bc61ea8caf51a104a51228f21c1819d1d8e2177effe0160e9710bab AS build

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