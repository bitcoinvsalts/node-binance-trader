#############
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:27ded04cb5d853120488a0b3965e846553b4c58aa09ce7586528f75285e5407c AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:27ded04cb5d853120488a0b3965e846553b4c58aa09ce7586528f75285e5407c AS build

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.16.1-alpine3.13@sha256:456c8212fc3d61b32ef1e88903e4aaa2138f4bef2d4407938c667ad78d89f099 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./