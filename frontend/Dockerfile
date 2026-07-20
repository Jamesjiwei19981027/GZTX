# Dev image: Vite HMR on 5173 (docker-compose.yml)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# 锁文件由 npm 11 生成，node:20 自带 npm 10 校验会误报不同步
RUN npm install -g npm@^11 && npm ci --prefer-offline

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
