FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
COPY client ./client
# Hospedagens (Render, Railway, Fly…) colocam um proxy na frente: sem isso, todos os
# jogadores pareceriam ter o mesmo IP e os limites anti-spam valeriam para todos juntos.
ENV NODE_ENV=production PORT=3000 TRUST_PROXY=1
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
