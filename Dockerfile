FROM node:alpine3.20

WORKDIR /app

COPY yarn.lock package.json ./

RUN yarn

COPY src/ ./src
#COPY minmax.txt ./

CMD ["npm", "run", "start"]
