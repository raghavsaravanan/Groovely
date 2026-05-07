FROM python:3.11-slim

WORKDIR /app

# System dependencies for ffmpeg and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set Python memory management environment variables
ENV PYTHONHASHSEED=0
ENV MALLOC_ARENA_MAX=2
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy backend code
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Expose port (Render will map this dynamically via $PORT)
EXPOSE 8000

# Run FastAPI app - Render provides PORT env var, default to 8000 if not set
# Timeout settings: keep-alive=75s (Render free tier has 30s request timeout, but we need buffer for processing)
# Graceful shutdown allows 10s for cleanup
CMD sh -c "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 75 --timeout-graceful-shutdown 10"


