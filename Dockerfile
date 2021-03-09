#############
# Should be the specific version of node:alpine3.
FROM node:14.15.5-buster@sha256:28b64286eb60f8b14112c9d3900a826743796b0efe04344c8a25371d56ac6b86 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.15.5-buster@sha256:28b64286eb60f8b14112c9d3900a826743796b0efe04344c8a25371d56ac6b86 AS build

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.15.5-alpine3.13@sha256:03b86ea1f9071a99ee3de468659c9af95ca0bedbcd7d32bf31d61fa32c1a8ab3 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./