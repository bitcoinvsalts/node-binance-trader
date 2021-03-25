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
FROM node:14.16.0-alpine3.13@sha256:00eafdb082a1f26bc0a2014abfaac9924533c8838fc8d443780cf9e0c045f64e AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./