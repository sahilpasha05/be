FROM node:20-bullseye-slim

# Install system dependencies for python and pdftotext
RUN apt-get update && apt-get install -y \\
    python3 python3-pip python3-venv \\
    poppler-utils \\
    && rm -rf /var/lib/apt/lists/*

# Set up python environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY package*.json ./
RUN npm install

COPY server.js .

EXPOSE 3000
CMD ["npm", "start"]
