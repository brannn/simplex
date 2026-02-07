# Multi-stage build for smaller final image
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod
COPY go.mod ./

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o simplex-web ./cmd/server

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/simplex-web .

# Set environment variables
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./simplex-web"]