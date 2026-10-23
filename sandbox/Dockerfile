FROM node:22-alpine
RUN apk add --no-cache g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY sandbox/sandbox-server.js ./
EXPOSE 8080
CMD ["node", "sandbox-server.js"]


# FROM golang:1.22-alpine
# RUN apk add --no-cache g++ make
# WORKDIR /app
# COPY main.go .
# RUN go build -o sandbox-server main.go
# EXPOSE 8080
# CMD ["./sandbox-server"]