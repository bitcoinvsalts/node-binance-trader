#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:591bcda2e6b9f9c036de00cd0bac0304110623df8903c87747018b520e1c2f7f AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:591bcda2e6b9f9c036de00cd0bac0304110623df8903c87747018b520e1c2f7f AS build

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-alpine3.13@sha256:eb2b2be77fbb7515ba116dbf20b55df0523e9d32e0c7b22bb5d625bdd0ad9109 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./