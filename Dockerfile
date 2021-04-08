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
FROM node:14.16.1-alpine3.13@sha256:4ffbef007b0214706fb8ec92353ccd5b0a12d9d1522e0f2c5e0a8bde3f9d8985 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./