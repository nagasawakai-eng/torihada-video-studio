FROM node:20-slim

# LibreOffice: PPTX → PDF 変換に使用（PDF→PNGはNode側でpdf-to-imgを使うためpoppler-utilsは不要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice \
      fonts-noto-cjk \
      ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]
