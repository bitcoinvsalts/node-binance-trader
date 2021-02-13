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
RUN yarn install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.15.5-alpine3.13@sha256:17dc61b31b2a12a1390b5a4e2e69b0d0886a0d77647f88c5a33787ac457fa83e AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./