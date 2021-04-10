#############
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:509f8951071aad29c33f5b8add246f2dfe98ae4b5120a7a53b495584a9be54f1 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.1-buster@sha256:509f8951071aad29c33f5b8add246f2dfe98ae4b5120a7a53b495584a9be54f1 AS build

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