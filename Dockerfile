FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5001

ENV PORT=5001
ENV NODE_ENV=development

CMD ["npm", "run", "dev"] 