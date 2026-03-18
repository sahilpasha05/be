FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv python3-dev build-essential poppler-utils && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY package*.json ./
RUN npm install

COPY server.js .

EXPOSE 3000
CMD ["npm", "start"]
