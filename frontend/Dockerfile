# Dev image: Vite HMR on 5173 (docker-compose.yml)
# 正式 Web 真源：Stitch/Remix 人轴壳层（原 remix-flow 目录已迁入本目录）
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# 锁文件可能由较新 npm 生成，node:20 自带 npm 10 偶发误报
RUN npm install -g npm@^11 && npm ci --prefer-offline

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
