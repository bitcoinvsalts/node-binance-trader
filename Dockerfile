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

WORKDIR /srv/app/

COPY --from=development /srv/app/ ./

RUN npm install && \
    npm run lint && \
    npm run test

ENV NODE_ENV=production

# Discard devDependencies.
RUN npm install


#######################
# Should be the specific version of node:alpine3.
FROM node:14.16.1-alpine3.13@sha256:7021600941a9caa072c592b6a89cec80e46cb341d934f1868220f5786f236f60 AS production

ENV NODE_ENV=production

WORKDIR /srv/app/

COPY --from=build /srv/app/ ./
