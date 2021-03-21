#############
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:5ce0dfc26443809b722786397662c1aa62dea79349fa0aae7aaa10a63b559248 AS development

WORKDIR /srv/app/

COPY ./package.json ./package-lock.json ./

RUN npm install

COPY ./ ./


########################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-buster@sha256:5ce0dfc26443809b722786397662c1aa62dea79349fa0aae7aaa10a63b559248 AS build

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.16.0-alpine3.13@sha256:7eb57d8fd2d3ee789dbb551bdf5b0325369c3ad7a72a690e80d034041da7e42d AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./