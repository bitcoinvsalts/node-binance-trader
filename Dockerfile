#############
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:2987c9901737e98c482efa355eb58337c114e806f7d65ef6ccdd5d5781969930 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:2987c9901737e98c482efa355eb58337c114e806f7d65ef6ccdd5d5781969930 AS build

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