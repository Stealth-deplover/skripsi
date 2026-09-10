FROM node:22-alpine AS build
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV VITE_API_BASE_URL=/api
WORKDIR /app
RUN npm config set registry https://registry.npmjs.org/
COPY package*.json ./
RUN rm -f package-lock.json && npm install --no-audit --no-fund --legacy-peer-deps
COPY . ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
