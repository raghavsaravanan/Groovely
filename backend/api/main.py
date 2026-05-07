import gc
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Persistence layer (replaces JSON file storage)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import db

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, UploadFile, Request, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
import hashlib
import threading
import time

# Load environment variables from .env file
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, skip loading .env file

# Supabase client for storage uploads
try:
    from supabase import create_client, Client  # type: ignore
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("[WARN] Supabase client not available. Install with: pip install supabase")

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_ROOT = BASE_DIR
ACTUAL_ROOT = BASE_DIR / "storage" / "actual"
TRIES_ROOT = BASE_DIR / "storage" / "tries"
DATA_ROOT = BASE_DIR / "data"
COMPRESSED_VIDEO_CACHE_DIR = BASE_DIR / "storage" / "compressed_cache"

# Maximum upload size: 200 MB
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

# Ensure directories exist
for directory in (ACTUAL_ROOT, TRIES_ROOT, DATA_ROOT, COMPRESSED_VIDEO_CACHE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
}
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".m4v", ".mkv"}
# Note: .webm is explicitly allowed (recorded in app)

# Offset between video and routine audio when remuxing (seconds).
# Set to 0.0 to start audio exactly with the video; adjust if you observe
# a consistent lead/lag in the output.
# In ffmpeg, -itsoffset with positive value delays the stream, negative advances it.
# User reported audio is ahead of video, so we set to 0.0 for perfect sync
# If audio is still ahead, use positive value (e.g., 0.5) to delay audio
# If audio is behind, use negative value (e.g., -0.5) to advance audio
AUDIO_VIDEO_SYNC_OFFSET_SECONDS = 0.0

# ============================================================================
# PRODUCTION READINESS: Security, Monitoring, and Reliability
# ============================================================================

# Debug mode - set via environment variable (default: False for production)
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"

# File locking for JSON operations (prevent corruption)
_index_locks: Dict[str, threading.Lock] = {
    "routines": threading.Lock(),
    "tries": threading.Lock(),
}

# Request metrics tracking
_request_metrics = {
    "total_requests": 0,
    "errors": 0,
    "processing_times": [],
    "error_types": {},
}
_metrics_lock = threading.Lock()

# Rate limiting (simple in-memory, per-IP)
_rate_limit_store: Dict[str, list] = {}
_rate_limit_lock = threading.Lock()
RATE_LIMIT_REQUESTS = 100  # requests per window
RATE_LIMIT_WINDOW = 60  # seconds

def _debug_log(message: str):
    """Conditional debug logging - only logs if DEBUG_MODE is enabled"""
    if DEBUG_MODE:
        logger = logging.getLogger(__name__)
        logger.debug(message)
        print(f"[DEBUG] {message}")

def _validate_routine_id(routine_id: str) -> bool:
    """
    Validate routine_id format to prevent path traversal attacks.
    Routine IDs should be hex strings (32 chars from uuid.uuid4().hex)
    """
    if not routine_id:
        return False
    # Must be exactly 32 hex characters (uuid4 hex format)
    if len(routine_id) != 32:
        return False
    # Must contain only hexadecimal characters
    try:
        int(routine_id, 16)
        return True
    except ValueError:
        return False

def _validate_environment():
    """Validate required environment variables on startup"""
    required_vars = []
    if SUPABASE_AVAILABLE:
        required_vars = ["SUPABASE_URL", "SUPABASE_KEY"]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        logger = logging.getLogger(__name__)
        logger.warning(f"Missing environment variables: {missing}. Some features may not work.")
    return len(missing) == 0

# Validate environment on startup
_validate_environment()

# Clean up orphaned temp directories on startup
def _cleanup_old_temp_dirs():
    """Remove temp directories older than 1 hour"""
    try:
        import glob
        import time
        temp_base = Path(tempfile.gettempdir())
        patterns = ["try_*", "routine_*"]
        cleaned = 0
        for pattern in patterns:
            for temp_dir in glob.glob(str(temp_base / pattern)):
                try:
                    temp_path = Path(temp_dir)
                    if temp_path.is_dir():
                        age = time.time() - temp_path.stat().st_mtime
                        if age > 3600:  # 1 hour
                            shutil.rmtree(temp_path, ignore_errors=True)
                            cleaned += 1
                except:
                    pass
        if cleaned > 0:
            logger = logging.getLogger(__name__)
            logger.info(f"Cleaned up {cleaned} orphaned temp directories")
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Temp cleanup failed (non-critical): {e}")

# Run cleanup on startup
_cleanup_old_temp_dirs()


def _load_index(path: Path) -> Dict[str, Dict]:
    """Load JSON index with file locking to prevent corruption"""
    lock_name = "routines" if "routines" in str(path) else "tries"
    lock = _index_locks.get(lock_name, threading.Lock())
    
    with lock:
        if path.exists():
            try:
                with path.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError as e:
                logger = logging.getLogger(__name__)
                logger.error(f"JSON decode error in {path}: {e}")
                # Return empty dict if corrupted
                return {}
        return {}


def _write_index(path: Path, data: Dict[str, Dict]) -> None:
    """Write JSON index with file locking and atomic write to prevent corruption"""
    lock_name = "routines" if "routines" in str(path) else "tries"
    lock = _index_locks.get(lock_name, threading.Lock())
    
    with lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        try:
            with tmp_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            # Atomic replace
            tmp_path.replace(path)
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to write index {path}: {e}")
            # Clean up temp file on error
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except:
                    pass
            raise


def _save_upload(upload: UploadFile, destination: Path, max_bytes: int = MAX_UPLOAD_BYTES) -> None:
    """Save uploaded file to disk, rejecting files that exceed max_bytes."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)
    bytes_written = 0
    chunk_size = 1024 * 1024  # 1 MB chunks
    with destination.open("wb") as buffer:
        while True:
            chunk = upload.file.read(chunk_size)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                buffer.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large: exceeds {max_bytes // (1024 * 1024)} MB limit."
                )
            buffer.write(chunk)


def _transcode_to_mp3(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i",
        str(source),
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        str(destination),
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else str(exc)
        raise RuntimeError(stderr or "ffmpeg failed to transcode audio") from exc


def _get_video_dimensions(source: Path) -> tuple[int, int]:
    """
    Get video width and height using ffprobe.
    
    Returns:
        Tuple of (width, height) or (0, 0) if unable to determine
    """
    try:
        import json
        ffprobe_exe = FFMPEG_EXE.replace("ffmpeg", "ffprobe")
        if Path(ffprobe_exe).exists() or shutil.which("ffprobe"):
            probe_cmd = [ffprobe_exe if Path(ffprobe_exe).exists() else "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(source)]
            result = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True, timeout=5)
            data = json.loads(result.stdout)
            
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = stream.get("width", 0)
                    height = stream.get("height", 0)
                    return (width, height)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError, Exception):
        pass
    
    return (0, 0)


def _needs_video_conversion(source: Path, max_resolution: int = 480, max_size_mb: int = 100) -> bool:
    """
    Check if video needs conversion/compression.
    Returns True if video needs processing, False if it can be used as-is.
    
    Args:
        source: Source video file path
        max_resolution: Maximum height in pixels
        max_size_mb: Maximum file size in MB before compression is needed
    """
    if not source.exists():
        return True
    
    # Check file size - if too large, always compress
    size_mb = source.stat().st_size / (1024 * 1024)
    if size_mb > max_size_mb:
        return True
    
    # BETTER SKIP RULE: If < 2MB, skip compression no matter what
    if size_mb < 2:
        return False
    
    # Check if already MP4 - if not, needs conversion
    if source.suffix.lower() != ".mp4":
        return True
    
    # REAL SKIP RULE: If mp4 AND <10MB AND height ≤ 720p, skip conversion completely
    if size_mb < 10:
        # For small files, check resolution using ffprobe
        try:
            import json
            # Try to find ffprobe
            ffprobe_exe = FFMPEG_EXE.replace("ffmpeg", "ffprobe")
            if Path(ffprobe_exe).exists() or shutil.which("ffprobe"):
                probe_cmd = [ffprobe_exe if Path(ffprobe_exe).exists() else "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(source)]
                result = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True, timeout=5)
                data = json.loads(result.stdout)
                
                # Find video stream
                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "video":
                        height = stream.get("height", 0)
                        # REAL SKIP: mp4 AND <10MB AND height ≤ 720p → skip conversion
                        if height > 0 and height <= 720:
                            return False  # Skip conversion completely
                        # If too high resolution, needs conversion
                        return True
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError, Exception):
            # If we can't check, assume small MP4 files are fine (skip conversion)
            return False
    
    # For larger files (>10MB), always check resolution
    try:
        import json
        ffprobe_exe = FFMPEG_EXE.replace("ffmpeg", "ffprobe")
        if Path(ffprobe_exe).exists() or shutil.which("ffprobe"):
            probe_cmd = [ffprobe_exe if Path(ffprobe_exe).exists() else "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(source)]
            result = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True, timeout=5)
            data = json.loads(result.stdout)
            
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    height = stream.get("height", 0)
                    if height > 0 and height <= 720:
                        return False
                    return True
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError, Exception):
        pass
    
    # Default: needs conversion if we can't verify
    return True


def _convert_to_mp4(source: Path, destination: Path, max_resolution: int = 480) -> None:
    """
    Convert video to MP4 with compression to reduce memory usage.
    Uses caching to ensure identical videos produce identical compressed outputs.
    
    Args:
        source: Source video file path
        destination: Destination MP4 file path
        max_resolution: Maximum height in pixels (default 480 for memory efficiency)
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    
    # Check if source file exists
    if not source.exists():
        raise RuntimeError(f"Source video file does not exist: {source}")
    
    # Check if ffmpeg is available
    try:
        subprocess.run([FFMPEG_EXE, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise RuntimeError(f"ffmpeg is not available at '{FFMPEG_EXE}'. Please install ffmpeg: brew install ffmpeg")
    
    # CRITICAL FIX: Cache compressed videos based on source hash to ensure consistency
    # If we've compressed this exact video before, reuse the cached version
    source_hash = _sha256(source)
    cache_key = f"{source_hash}_{max_resolution}.mp4"
    cached_path = COMPRESSED_VIDEO_CACHE_DIR / cache_key
    
    if cached_path.exists():
        # Use cached compressed video - ensures identical output for identical input
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Using cached compressed video (hash: {source_hash[:8]}...) for consistency")
        shutil.copy2(cached_path, destination)
        return
    
    # Build ffmpeg command with compression and scaling
    # Optimized for speed on free tier Render (480p, faster encoding)
    # Higher CRF (30) = more compression, faster encoding
    # IMPORTANT: Using deterministic settings for consistent scoring
    # Single-threaded encoding ensures identical output for identical input
    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i",
        str(source),
        "-vf", f"scale=-2:{max_resolution}",  # Scale to max height, maintain aspect ratio
        "-c:v",
        "libx264",
        "-preset",
        "medium",  # Medium preset for better consistency (balance between speed and determinism)
        "-tune", "fastdecode",  # Optimize for fast decoding
        "-threads", "1",  # CRITICAL: Single-threaded for deterministic encoding (same input = same output)
        "-crf",
        "30",  # Higher CRF = faster encoding (30 is good balance for speed)
        "-maxrate", "1.5M",  # Lower bitrate = smaller files, faster upload
        "-bufsize", "3M",  # Smaller buffer
        "-g", "30",  # Keyframe interval for consistency
        "-sc_threshold", "0",  # Disable scene change detection for consistency
        "-x264-params", "keyint=30:min-keyint=30:scenecut=0:threads=1",  # Force consistent keyframes and single-threaded
        "-c:a",
        "aac",
        "-b:a", "96k",  # Lower audio bitrate = smaller files
        "-movflags",
        "+faststart",
        str(destination),
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        
        # CRITICAL FIX: Cache the compressed video for future use
        # This ensures identical videos always produce identical compressed outputs
        if destination.exists():
            try:
                shutil.copy2(destination, cached_path)
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Cached compressed video (hash: {source_hash[:8]}...) for future consistency")
            except Exception as cache_err:
                # Non-critical - if caching fails, just log and continue
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to cache compressed video (non-critical): {cache_err}")
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else str(exc)
        # Extract meaningful error message
        error_lines = stderr.split('\n') if stderr else []
        error_msg = next((line for line in error_lines if 'error' in line.lower() or 'failed' in line.lower()), None)
        if error_msg:
            raise RuntimeError(f"Video conversion failed: {error_msg}")
        raise RuntimeError(f"ffmpeg failed to convert video. Source: {source.name}, Error: {stderr[:200]}")


# Import dance analysis helpers
SCRIPT_DIR = BASE_DIR / "scripts"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from dance import (  # type: ignore
        align_and_score,
        create_side_by_side,
        extract_pose_keypoints,
        extract_motion_features_simple,
        compute_similarity_score_simple,
        get_video_length,
        write_json,
        write_markdown,
        FFMPEG_EXE,
    )
except ImportError as exc:  # pragma: no cover
    _py = sys.executable
    raise RuntimeError(
        "Unable to import dance analysis utilities (often missing mediapipe for this Python). "
        f"Original error: {exc}\n"
        f"Interpreter in use: {_py}\n"
        f"Fix: {_py} -m pip install -r requirements.txt\n"
        "Or from backend/: ./setup-venv.sh then ./start.sh"
    ) from exc


# Configure FastAPI with longer timeouts for video processing
app = FastAPI(
    title="Groovely API",
    # Increase timeout for long video processing (58+ seconds)
    # Default is 60s, increase to 10 minutes for long videos
)

# Request timing and monitoring middleware
class RequestTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        start_time = time.time()
        error_occurred = False
        error_type = None
        
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            error_occurred = True
            error_type = type(e).__name__
            raise
        finally:
            process_time = time.time() - start_time
            
            with _metrics_lock:
                _request_metrics["total_requests"] += 1
                _request_metrics["processing_times"].append(process_time)
                # Keep only last 1000 processing times
                if len(_request_metrics["processing_times"]) > 1000:
                    _request_metrics["processing_times"] = _request_metrics["processing_times"][-1000:]
                
                if error_occurred:
                    _request_metrics["errors"] += 1
                    if error_type:
                        _request_metrics["error_types"][error_type] = _request_metrics["error_types"].get(error_type, 0) + 1
                
                # Log slow requests
                if process_time > 5.0:
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Slow request: {request.url.path} took {process_time:.2f}s")

# Rate limiting middleware
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        # Get client IP (check X-Forwarded-For for load balancers/proxies)
        client_ip = "unknown"
        if request.client:
            client_ip = request.client.host
        # Check for real IP behind proxy/load balancer
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs, take the first one
            client_ip = forwarded_for.split(",")[0].strip()
        elif request.headers.get("X-Real-IP"):
            client_ip = request.headers.get("X-Real-IP")
        
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/api/health", "/metrics", "/api/metrics"]:
            return await call_next(request)
        
        current_time = time.time()
        logger = logging.getLogger(__name__)
        
        with _rate_limit_lock:
            # Clean old entries first (remove requests outside the time window)
            if client_ip in _rate_limit_store:
                _rate_limit_store[client_ip] = [
                    req_time for req_time in _rate_limit_store[client_ip]
                    if current_time - req_time < RATE_LIMIT_WINDOW
                ]
            else:
                _rate_limit_store[client_ip] = []
            
            # Get current count BEFORE adding this request
            current_count = len(_rate_limit_store[client_ip])
            
            # Check if adding this request would exceed the limit
            if current_count >= RATE_LIMIT_REQUESTS:
                logger.warning(f"Rate limit exceeded for IP: {client_ip} (had {current_count} requests in last {RATE_LIMIT_WINDOW}s)")
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Please try again later."},
                    headers={
                        "Retry-After": str(RATE_LIMIT_WINDOW),
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "*",
                        "X-RateLimit-Limit": str(RATE_LIMIT_REQUESTS),
                        "X-RateLimit-Remaining": "0",
                    }
                )
            
            # Add current request to the store (atomic operation within lock)
            _rate_limit_store[client_ip].append(current_time)
            new_count = len(_rate_limit_store[client_ip])
        
        # Continue with the request (rate limit check passed)
        response = await call_next(request)
        
        # Add rate limit headers to response (for debugging)
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = str(RATE_LIMIT_REQUESTS - new_count)
        response.headers["X-RateLimit-Used"] = str(new_count)
        
        return response

# Add middleware BEFORE CORS (order matters)
app.add_middleware(RequestTimingMiddleware)
app.add_middleware(RateLimitMiddleware)

# CORS middleware - Get allowed origins from environment
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
if allowed_origins_env == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]
    # Always include localhost for development
    if "http://localhost:5173" not in allowed_origins:
        allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,  # Must be False when using wildcard
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

app.mount("/static", StaticFiles(directory=STATIC_ROOT), name="static")

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    import os
    import sys
    port = os.getenv("PORT", "8000")
    print("[INFO] Groovely API starting up...")
    print(f"[INFO] Python executable: {sys.executable}")
    print(f"[INFO] Python version: {sys.version}")
    print(f"[INFO] Server will run on port: {port}")
    print(f"[INFO] Using MediaPipe-based pose analysis")
    print(f"[INFO] Supabase client initialized: {supabase_client is not None}")
    print("[INFO] API ready to accept requests")
    print(f"[INFO] Health check available at: /api/health")

api_router = APIRouter(prefix="/api")

# Initialize Supabase client for storage uploads
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
supabase_client: Optional[Client] = None

if SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        print("[INFO] Supabase client initialized for storage uploads")
    except Exception as e:
        print(f"[WARN] Failed to initialize Supabase client: {e}")
        supabase_client = None
elif not SUPABASE_AVAILABLE:
    print("[WARN] Supabase client not available. Videos will be stored locally only.")
elif not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[WARN] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")

# Wire persistence layer — must happen after supabase_client is resolved
db.init(supabase_client)


def _upload_to_supabase_storage(file_path: Path, bucket: str, storage_path: str, max_retries: int = 3) -> Optional[str]:
    """
    Upload a file to Supabase storage with retry logic and return the public URL.
    Avoids loading the whole file into memory by using chunked upload.
    
    Args:
        file_path: Local path to the file to upload
        bucket: Supabase storage bucket name (e.g., 'videos', 'audio')
        storage_path: Path within the bucket (e.g., 'routines/abc123/video.mp4')
        max_retries: Maximum number of retry attempts (default: 3)
    
    Returns:
        Public URL of the uploaded file, or None if upload failed
    """
    if not SUPABASE_AVAILABLE or not supabase_client:
        logger = logging.getLogger(__name__)
        logger.warning(f"Supabase not available, skipping upload of {file_path.name}")
        return None
    
    if not file_path.exists():
        logger = logging.getLogger(__name__)
        logger.error(f"File does not exist: {file_path}")
        return None
    
    logger = logging.getLogger(__name__)

    # Stream file in chunks — avoids loading entire video into memory
    def _read_file_bytes() -> bytes:
        """Read file content for upload. Uses chunked reading to log size."""
        file_size = file_path.stat().st_size
        if file_size > 50 * 1024 * 1024:
            logger.info(f"Uploading large file ({file_size / 1024 / 1024:.1f} MB): {file_path.name}")
        with file_path.open("rb") as fh:
            return fh.read()

    try:
        file_content = _read_file_bytes()
    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {e}")
        return None

    # Retry upload logic
    last_error = None
    for attempt in range(max_retries):
        try:
            # Upload to Supabase storage
            try:
                response = supabase_client.storage.from_(bucket).upload(
                    storage_path,
                    file_content,
                    file_options={"content-type": _get_content_type(file_path)}
                )
                
                # Get public URL
                public_url_data = supabase_client.storage.from_(bucket).get_public_url(storage_path)
                if isinstance(public_url_data, dict):
                    public_url = public_url_data.get("publicUrl") or public_url_data.get("public_url")
                elif isinstance(public_url_data, str):
                    public_url = public_url_data
                else:
                    public_url = str(public_url_data) if public_url_data else None
                
                if public_url:
                    logger.info(f"Successfully uploaded {file_path.name} to Supabase storage: {storage_path}")
                    return public_url
                else:
                    last_error = "Upload succeeded but failed to get public URL"
                    if attempt < max_retries - 1:
                        time.sleep(1 * (attempt + 1))
                        continue
            except Exception as upload_error:
                # Check if it's a "already exists" error
                error_str = str(upload_error).lower()
                if "already exists" in error_str or "duplicate" in error_str:
                    # File already exists, get the public URL anyway
                    public_url_data = supabase_client.storage.from_(bucket).get_public_url(storage_path)
                    if isinstance(public_url_data, dict):
                        public_url = public_url_data.get("publicUrl") or public_url_data.get("public_url")
                    elif isinstance(public_url_data, str):
                        public_url = public_url_data
                    else:
                        public_url = str(public_url_data) if public_url_data else None
                    if public_url:
                        logger.info(f"File already exists in Supabase storage, using existing: {storage_path}")
                        return public_url
                
                last_error = str(upload_error)
                if attempt < max_retries - 1:
                    logger.warning(f"Upload attempt {attempt + 1} failed for {storage_path}: {upload_error}. Retrying...")
                    time.sleep(1 * (attempt + 1))  # Exponential backoff
                else:
                    raise
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                logger.warning(f"Upload attempt {attempt + 1} failed for {storage_path}: {e}. Retrying...")
                time.sleep(1 * (attempt + 1))  # Exponential backoff
            else:
                logger.error(f"Failed to upload {file_path.name} to Supabase after {max_retries} attempts: {e}")
    
    return None


def _get_content_type(file_path: Path) -> str:
    """Determine content type based on file extension."""
    suffix = file_path.suffix.lower()
    content_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".json": "application/json",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
    }
    return content_types.get(suffix, "application/octet-stream")


def _remux_video_with_routine_audio(user_video_path: Path, routine_audio_path: Path, output_path: Path, logger) -> bool:
    """
    Remux user attempt video with routine audio track.
    
    Args:
        user_video_path: Path to the user's attempt video
        routine_audio_path: Path to the routine's audio file
        output_path: Path where the remuxed video should be saved
        logger: Logger instance for logging
    
    Returns:
        True if remuxing succeeded, False otherwise
    """
    if not user_video_path.exists():
        logger.error(f"❌ User video file not found: {user_video_path}")
        return False
    
    if not routine_audio_path.exists():
        logger.error(f"❌ Routine audio file not found: {routine_audio_path}")
        return False
    
    try:
        # Get video duration to ensure audio matches
        video_duration, _, video_fps = get_video_length(str(user_video_path))
        logger.info(f"Remuxing attempt video with routine audio (video duration: {video_duration:.2f}s, fps: {video_fps:.2f}, offset: {AUDIO_VIDEO_SYNC_OFFSET_SECONDS}s)...")
        
        # Build ffmpeg command with proper audio sync
        cmd = [
            FFMPEG_EXE,
            "-y",
            "-i", str(user_video_path),
        ]
        
        # Apply audio offset if needed (positive = delay audio, negative = advance audio)
        if AUDIO_VIDEO_SYNC_OFFSET_SECONDS != 0.0:
            cmd.extend(["-itsoffset", str(AUDIO_VIDEO_SYNC_OFFSET_SECONDS)])
        
        cmd.extend([
            "-i", str(routine_audio_path),
            "-map", "0:v:0",  # Use video from first input (user video)
            "-map", "1:a:0",  # Use audio from second input (routine audio)
            "-c:v", "copy",  # Copy video stream (no re-encoding)
            "-c:a", "aac",  # Encode audio as AAC
            "-b:a", "128k",  # Audio bitrate
            "-shortest",  # End when shortest stream ends
            str(output_path),
        ])
        
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd, 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.PIPE, 
            check=True, 
            text=True, 
            timeout=300
        )
        
        # Verify the remuxed file was created and has content
        if output_path.exists() and output_path.stat().st_size > 0:
            logger.info(f"✅ Successfully remuxed video with routine audio ({output_path.stat().st_size} bytes)")
            return True
        else:
            logger.error(f"❌ Remuxed file was not created or is empty at {output_path}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Remuxing timed out after 300 seconds")
        return False
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else str(exc)
        logger.error(f"❌ Failed to remux video with routine audio: {stderr[:500]}")
        return False
    except Exception as exc:
        logger.error(f"❌ Unexpected error while remuxing video: {exc}")
        return False


def _download_from_supabase_storage(bucket: str, storage_path: str, destination: Path, max_retries: int = 3) -> bool:
    """
    Download a file from Supabase storage to a local path with retry logic.
    
    Args:
        bucket: Supabase storage bucket name (e.g., 'videos', 'audio')
        storage_path: Path within the bucket (e.g., 'routines/abc123/video.mp4')
        destination: Local path where the file should be saved
        max_retries: Maximum number of retry attempts (default: 3)
    
    Returns:
        True if download succeeded, False otherwise
    """
    if not SUPABASE_AVAILABLE or not supabase_client:
        logger = logging.getLogger(__name__)
        logger.warning(f"Supabase not available, cannot download {storage_path}")
        return False
    
    import time
    last_error = None
    
    for attempt in range(max_retries):
        try:
            # Download file content with timeout
            response = supabase_client.storage.from_(bucket).download(storage_path)
            
            if response:
                # Ensure destination directory exists
                destination.parent.mkdir(parents=True, exist_ok=True)
                
                # Write content to file
                with destination.open("wb") as f:
                    if isinstance(response, bytes):
                        f.write(response)
                    else:
                        f.write(response)
                
                logger = logging.getLogger(__name__)
                logger.info(f"Successfully downloaded {storage_path} from Supabase storage")
                return True
            else:
                last_error = "Empty response"
                if attempt < max_retries - 1:
                    time.sleep(1 * (attempt + 1))  # Exponential backoff
                    continue
        except Exception as e:
            last_error = str(e)
            logger = logging.getLogger(__name__)
            if attempt < max_retries - 1:
                logger.warning(f"Download attempt {attempt + 1} failed for {storage_path}: {e}. Retrying...")
                time.sleep(1 * (attempt + 1))  # Exponential backoff
            else:
                logger.error(f"Failed to download {storage_path} from Supabase after {max_retries} attempts: {e}")
    
    return False


def _download_file_from_url(file_url: Optional[str], destination: Path) -> bool:
    """
    Download a publicly accessible file (e.g., Supabase public URL) to a local path.
    """
    if not file_url:
        return False

    try:
        with urllib.request.urlopen(file_url) as response:  # type: ignore[arg-type]
            if getattr(response, "status", 200) >= 400:
                print(f"[ERROR] Failed to download {file_url}: HTTP {response.status}")
                return False

            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as out_file:
                shutil.copyfileobj(response, out_file)
        print(f"[INFO] Downloaded file from public URL: {file_url}")
        return True
    except Exception as exc:
        print(f"[WARN] Could not download {file_url}: {exc}")
        return False


def _get_routine_from_supabase_storage(routine_id: str) -> Optional[Dict[str, str]]:
    """
    Check if routine files exist in Supabase storage and return their URLs.
    This is used as a fallback when routine is not in local index.
    
    Returns:
        Dict with 'video_url' and 'audio_url' if found, None otherwise
    """
    if not SUPABASE_AVAILABLE or not supabase_client or not SUPABASE_URL:
        return None
    
    # Construct expected storage paths
    video_storage_path = f"routines/{routine_id}/video.mp4"
    audio_storage_path = f"routines/{routine_id}/audio.mp3"
    
    # Construct public URLs (Supabase public bucket URLs)
    # Format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    base_url = SUPABASE_URL.rstrip('/')
    video_url = f"{base_url}/storage/v1/object/public/videos/{video_storage_path}"
    audio_url = f"{base_url}/storage/v1/object/public/audio/{audio_storage_path}"
    
    # Try to verify files exist by checking if we can get public URL
    # For public buckets, we can just construct the URL
    # If files don't exist, the download will fail later, but at least we have the URLs
    print(f"[INFO] Checking Supabase storage for routine {routine_id}")
    print(f"[INFO] Video URL: {video_url}")
    print(f"[INFO] Audio URL: {audio_url}")
    
    return {
        "video_url": video_url,
        "audio_url": audio_url,
        "video_supabase_url": video_url,
        "audio_supabase_url": audio_url,
    }


def _get_local_routine_file(routine: Dict, path_key: str, fallback_filename: str) -> Optional[Path]:
    """
    Resolve a routine asset path from the index or fallback to ACTUAL_ROOT/{routine_id}/{fallback_filename}.
    """
    candidate = routine.get(path_key)
    if candidate:
        local_path = (BASE_DIR / candidate.replace("\\", "/")).resolve()
        if local_path.exists():
            return local_path

    routine_id = routine.get("routine_id")
    if routine_id:
        fallback_path = ACTUAL_ROOT / routine_id / fallback_filename
        if fallback_path.exists():
            return fallback_path
    return None


def _routine_media_paths(routine_id: str) -> Dict[str, Path]:
    routine_dir = ACTUAL_ROOT / routine_id
    return {
        "dir": routine_dir,
        "video": routine_dir / "actual.mp4",
        "audio": routine_dir / "audio.mp3",
    }


def _try_paths(try_id: str) -> Dict[str, Path]:
    try_dir = TRIES_ROOT / try_id
    return {
        "dir": try_dir,
        "user_video": try_dir / "user.mp4",
        "comparison": try_dir / "comparison_overlay.mp4",
        "out_dir": try_dir / "out",
        "critique_json": try_dir / "out" / "critique.json",
        "critique_md": try_dir / "out" / "critique.md",
    }


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def _require_audio(upload: UploadFile) -> None:
    content_type = upload.content_type or ""
    filename = upload.filename or ""
    suffix = Path(filename).suffix.lower()
    
    # Allow audio files
    if content_type in {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"}:
        return
    if suffix in {".mp3", ".wav", ".m4a", ".aac"}:
        return
    
    # Also allow video files (we'll extract audio from them)
    if content_type in ALLOWED_VIDEO_CONTENT_TYPES:
        return
    if suffix in ALLOWED_VIDEO_SUFFIXES:
        return
    
    raise HTTPException(
        status_code=400,
        detail="Audio file must be MP3, WAV, or a video file with audio.",
    )


def _require_video(upload: UploadFile) -> None:
    content_type = upload.content_type or ""
    filename = upload.filename or ""
    suffix = Path(filename).suffix.lower()
    if content_type in ALLOWED_VIDEO_CONTENT_TYPES:
        return
    if suffix in ALLOWED_VIDEO_SUFFIXES:
        return
    raise HTTPException(
        status_code=400,
        detail="Video file must be MP4, MOV, MKV, or WEBM format.",
    )


def _process_routine_async(routine_id: str, temp_dir: Path, title: str, audio_start: Optional[float], audio_end: Optional[float]):
    """Process routine in background - TikTok-style async processing"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"[Background] Starting routine processing: {routine_id}")
        
        # Update status to processing
        existing = db.get_routine(routine_id) or {}
        existing["processing"] = True
        existing["status"] = "processing"
        db.upsert_routine(routine_id, existing)
        
        temp_video_path = None
        temp_audio_path = None
        processed_video_path = None
        processed_audio_path = None
        
        # Find uploaded files in temp directory
        for file in temp_dir.iterdir():
            if file.name.startswith("uploaded_video"):
                temp_video_path = file
            elif file.name.startswith("uploaded_audio"):
                temp_audio_path = file
        
        if not temp_video_path:
            raise RuntimeError(f"Video file not found in temp directory: {temp_dir}")
        if not temp_audio_path:
            raise RuntimeError(f"Audio file not found in temp directory: {temp_dir}")
        
        logger.info(f"[Background] Found files: video={temp_video_path.name} ({temp_video_path.stat().st_size} bytes), audio={temp_audio_path.name} ({temp_audio_path.stat().st_size} bytes)")
        
        # Process video to MP4 with compression - only if needed
        processed_video_path = temp_dir / "video.mp4"
        try:
            # Fast path: if already small MP4, just copy (no conversion needed)
            video_size_mb = temp_video_path.stat().st_size / (1024 * 1024)
            if (temp_video_path.suffix.lower() == ".mp4" and video_size_mb < 30):
                logger.info(f"[Background] Video already MP4 and small ({video_size_mb:.1f}MB), skipping conversion")
                shutil.copy2(temp_video_path, processed_video_path)
            else:
                # Check if conversion is needed (480p, up to 100MB threshold)
                needs_conversion = _needs_video_conversion(temp_video_path, 480, 100)
                
                # Get video dimensions and size for debug output
                orig_width, orig_height = _get_video_dimensions(temp_video_path)
                orig_size_mb = temp_video_path.stat().st_size / (1024 * 1024)
                
                # Debug log for compression decision
                _debug_log(f"Compression decision: {'SKIPPED' if not needs_conversion else 'ENCODED'}, orig_res={orig_width}x{orig_height}, orig_size_mb={orig_size_mb:.2f}")
                
                if needs_conversion:
                    logger.info(f"[Background] Converting video to MP4 (480p)...")
                    _convert_to_mp4(temp_video_path, processed_video_path, 480)
                    logger.info(f"[Background] Video conversion completed")
                else:
                    logger.info(f"[Background] Video already optimized, using as-is")
                    shutil.copy2(temp_video_path, processed_video_path)
        except RuntimeError as exc:
            logger.error(f"[Background] Video processing failed: {exc}")
            raise
        
        # Process audio
        processed_audio_path = temp_dir / "audio.mp3"
        logger.info(f"[Background] Processing audio from: {temp_audio_path} (size: {temp_audio_path.stat().st_size if temp_audio_path.exists() else 0} bytes)")
        try:
            if not temp_audio_path.exists():
                raise RuntimeError(f"Audio file not found: {temp_audio_path}")
            
            audio_suffix = temp_audio_path.suffix.lower()
            is_video_file = audio_suffix in ALLOWED_VIDEO_SUFFIXES
            
            effective_start = audio_start if audio_start is not None and audio_start >= 0 else None
            effective_end = audio_end if audio_end is not None and audio_end > 0 else None
            
            logger.info(f"[Background] Audio processing params: suffix={audio_suffix}, is_video={is_video_file}, start={effective_start}, end={effective_end}")
            
            def _build_trim_args() -> list[str]:
                args: list[str] = []
                if effective_start is not None:
                    args.extend(["-ss", str(effective_start)])
                if effective_end is not None and (effective_start is None or effective_end > effective_start):
                    args.extend(["-to", str(effective_end)])
                return args
            
            trim_args = _build_trim_args()
            
            if is_video_file:
                logger.info(f"[Background] Extracting audio from video file...")
                cmd = [FFMPEG_EXE, "-y", "-i", str(temp_audio_path)]
                if trim_args:
                    cmd.extend(trim_args)
                cmd.extend([
                    "-vn", 
                    "-acodec", "libmp3lame", 
                    "-q:a", "4",  # Faster encoding (4 instead of 2)
                    "-threads", "0",  # Use all CPU cores
                    str(processed_audio_path)
                ])
                result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, text=True)
                logger.info(f"[Background] Audio extraction completed")
            elif audio_suffix == ".mp3" and not trim_args:
                logger.info(f"[Background] Copying MP3 file directly (no conversion needed)")
                shutil.copy2(temp_audio_path, processed_audio_path)
            else:
                logger.info(f"[Background] Converting audio to MP3...")
                cmd = [FFMPEG_EXE, "-y", "-i", str(temp_audio_path)]
                if trim_args:
                    cmd.extend(trim_args)
                cmd.extend([
                    "-acodec", "libmp3lame", 
                    "-q:a", "4",  # Faster encoding (4 instead of 2)
                    "-threads", "0",  # Use all CPU cores
                    str(processed_audio_path)
                ])
                result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, text=True)
                logger.info(f"[Background] Audio conversion completed")
            
            # Verify processed audio file exists and has content
            if not processed_audio_path.exists():
                raise RuntimeError(f"Processed audio file was not created: {processed_audio_path}")
            audio_size = processed_audio_path.stat().st_size
            if audio_size == 0:
                raise RuntimeError(f"Processed audio file is empty: {processed_audio_path}")
            logger.info(f"[Background] ✅ Audio processed successfully: {processed_audio_path} (size: {audio_size} bytes)")
        except subprocess.CalledProcessError as exc:
            error_msg = exc.stderr.decode('utf-8', errors='ignore') if exc.stderr else str(exc)
            logger.error(f"[Background] Audio processing failed (subprocess error): {error_msg}")
            raise RuntimeError(f"Audio processing failed: {error_msg}") from exc
        except Exception as exc:
            logger.error(f"[Background] Audio processing failed: {exc}", exc_info=True)
            raise RuntimeError(f"Audio processing failed: {exc}") from exc
        
        # Verify processed files exist before remuxing
        if not processed_video_path.exists():
            raise RuntimeError(f"Processed video file does not exist: {processed_video_path}")
        if not processed_audio_path.exists():
            raise RuntimeError(f"Processed audio file does not exist: {processed_audio_path}")
        
        video_size = processed_video_path.stat().st_size
        audio_size = processed_audio_path.stat().st_size
        logger.info(f"[Background] Verified processed files: video={video_size} bytes, audio={audio_size} bytes")
        
        if video_size == 0:
            raise RuntimeError(f"Processed video file is empty: {processed_video_path}")
        if audio_size == 0:
            raise RuntimeError(f"Processed audio file is empty: {processed_audio_path}")
        
        # Remux video with audio to create final video file with embedded audio
        final_video_path = temp_dir / "final_video.mp4"
        logger.info(f"[Background] Remuxing video with audio track...")
        try:
            # Use ffmpeg to combine video and audio
            cmd = [
                FFMPEG_EXE, "-y",
                "-i", str(processed_video_path),  # Video input
                "-i", str(processed_audio_path),  # Audio input
                "-c:v", "copy",  # Copy video codec (no re-encoding)
                "-c:a", "aac",  # Encode audio as AAC for compatibility
                "-b:a", "128k",  # Audio bitrate
                "-map", "0:v:0",  # Use video from first input
                "-map", "1:a:0",  # Use audio from second input
                "-shortest",  # End when shortest stream ends
                str(final_video_path)
            ]
            result = subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=True,
                timeout=300,  # 5 minute timeout
                text=True
            )
            
            if not final_video_path.exists() or final_video_path.stat().st_size == 0:
                raise RuntimeError(f"Remuxed video file was not created or is empty: {final_video_path}")
            
            final_video_size = final_video_path.stat().st_size
            logger.info(f"[Background] ✅ Successfully remuxed video with audio ({final_video_size} bytes)")
        except subprocess.TimeoutExpired:
            logger.error(f"[Background] ❌ Remuxing timed out after 300 seconds")
            raise RuntimeError("Remuxing video with audio timed out")
        except subprocess.CalledProcessError as exc:
            error_msg = exc.stderr[:500] if exc.stderr else str(exc)
            logger.error(f"[Background] ❌ Failed to remux video with audio: {error_msg}")
            raise RuntimeError(f"Failed to remux video with audio: {error_msg}")
        except Exception as exc:
            logger.error(f"[Background] ❌ Unexpected error while remuxing video: {exc}")
            raise RuntimeError(f"Unexpected error while remuxing video: {exc}")
        
        # Upload processed files to Supabase storage in parallel (much faster!)
        video_storage_path = f"routines/{routine_id}/video.mp4"
        audio_storage_path = f"routines/{routine_id}/audio.mp3"
        
        from concurrent.futures import ThreadPoolExecutor
        
        logger.info(f"[Background] Uploading video (with audio) and audio to Supabase in parallel...")
        with ThreadPoolExecutor(max_workers=2) as executor:
            # Upload the remuxed video (which has audio embedded) instead of the processed video
            video_future = executor.submit(_upload_to_supabase_storage, final_video_path, "videos", video_storage_path)
            audio_future = executor.submit(_upload_to_supabase_storage, processed_audio_path, "audio", audio_storage_path)
            
            try:
                video_supabase_url = video_future.result()
                logger.info(f"[Background] Video upload result: {'success' if video_supabase_url else 'failed'}")
            except Exception as e:
                logger.error(f"[Background] Video upload failed: {e}")
                video_supabase_url = None
            
            try:
                audio_supabase_url = audio_future.result()
                logger.info(f"[Background] Audio upload result: {'success' if audio_supabase_url else 'failed'}")
            except Exception as e:
                logger.error(f"[Background] Audio upload failed: {e}")
                audio_supabase_url = None
        
        if not video_supabase_url:
            raise RuntimeError("Failed to upload video to Supabase storage")
        if not audio_supabase_url:
            raise RuntimeError("Failed to upload audio to Supabase storage")
        
        logger.info(f"[Background] ✅ Both files uploaded successfully: video={video_supabase_url[:50]}..., audio={audio_supabase_url[:50]}...")
        
        # Update routine metadata with Supabase URLs
        routine_data = {
            "routine_id": routine_id,
            "title": title or "Untitled Routine",
            "video_supabase_url": video_supabase_url,
            "audio_supabase_url": audio_supabase_url,
            "processing": False,
            "status": "completed",
        }
        db.upsert_routine(routine_id, routine_data)
        
        logger.info(f"[Background] Routine processing completed successfully: {routine_id}")
        
    except Exception as e:
        logger.error(f"[Background] Error processing routine: {e}", exc_info=True)
        # Update status to failed
        try:
            existing = db.get_routine(routine_id) or {}
            existing["processing"] = False
            existing["status"] = "failed"
            existing["error"] = str(e)
            db.upsert_routine(routine_id, existing)
        except Exception:
            pass
    finally:
        # Clean up temporary directory
        if temp_dir.exists():
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
                logger.info(f"[Background] Cleaned up temp directory: {temp_dir}")
            except Exception as cleanup_err:
                logger.warning(f"[Background] Failed to clean up temp directory: {cleanup_err}")


@api_router.post("/routines")
async def create_routine(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    audio: UploadFile = File(...),
    title: Optional[str] = Form(None),
    audio_start: Optional[float] = Form(None),
    audio_end: Optional[float] = Form(None),
):
    """TikTok-style async upload: Accept immediately, process in background"""
    logger = logging.getLogger("api.main")
    
    try:
        logger.info(f"Received routine creation request: title={title}, video={video.filename}, audio={audio.filename}")
        
        _require_video(video)
        _require_audio(audio)

        routine_id = uuid.uuid4().hex
        logger.info(f"Starting routine creation: {routine_id}")
        
        # Create temporary directory for uploaded files
        temp_dir = Path(tempfile.mkdtemp(prefix=f"routine_{routine_id}_"))
        logger.info(f"Created temp directory: {temp_dir}")
        
        # Save uploaded files quickly (no processing yet)
        video_suffix = Path(video.filename or "").suffix.lower()
        if not video_suffix:
            video_suffix = ".mp4"
        temp_video_path = temp_dir / f"uploaded_video{video_suffix}"
        await run_in_threadpool(_save_upload, video, temp_video_path)
        logger.info(f"Video file saved: {temp_video_path}")
        
        audio_suffix = Path(audio.filename or "").suffix.lower()
        if not audio_suffix:
            audio_suffix = ".mp3" if (audio.content_type or "").endswith("mpeg") else ".wav"
        temp_audio_path = temp_dir / f"uploaded_audio{audio_suffix}"
        logger.info(f"📥 Saving audio file: filename={audio.filename}, content_type={audio.content_type}, suffix={audio_suffix}")
        await run_in_threadpool(_save_upload, audio, temp_audio_path)
        audio_size = temp_audio_path.stat().st_size if temp_audio_path.exists() else 0
        logger.info(f"✅ Audio file saved: {temp_audio_path} (size: {audio_size} bytes)")
        
        # Check video duration (must be <= 60 seconds)
        try:
            video_duration, _, _ = get_video_length(str(temp_video_path))
            if video_duration > 60.0:  # 1 minute = 60 seconds
                raise HTTPException(
                    status_code=413,
                    detail=f"Video too long: {video_duration:.1f} seconds. Maximum duration is 60 seconds (1 minute)."
                )
            logger.info(f"Routine video duration: {video_duration:.2f} seconds (within 60s limit)")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
            logger.warning(f"Could not check video duration: {e}. Proceeding with upload.")
        
        # Store routine metadata with processing status
        routine_data = {
            "routine_id": routine_id,
            "title": title or "Untitled Routine",
            "processing": True,
            "status": "uploaded",
            "video_supabase_url": None,
            "audio_supabase_url": None,
        }
        db.upsert_routine(routine_id, routine_data)
        
        # Start background processing (TikTok-style: return immediately)
        logger.info(f"Starting background processing for routine: {routine_id}")
        background_tasks.add_task(_process_routine_async, routine_id, temp_dir, title or "Untitled Routine", audio_start, audio_end)
        
        logger.info(f"✅ Returning immediately with routine_id. Processing will complete in background.")
        return JSONResponse({
            "routine_id": routine_id,
            "processing": True,
            "status": "uploaded"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating routine: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create routine: {str(e)}"
        ) from e


def _relative_url(path: Path) -> str:
    return f"/static/{path.as_posix()}"


def _static_url_for(path: Path) -> str:
    try:
        relative = path.relative_to(STATIC_ROOT)
    except ValueError:
        relative = path
    return f"/static/{relative.as_posix()}"


def _persist_file_to_static(source: Path, destination: Path) -> Optional[str]:
    """
    Copy a generated file into the static directory so it can be served locally.
    Returns the static URL if successful.
    """
    if not source.exists():
        return None
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return _static_url_for(destination)


@api_router.get("/routines/{routine_id}")
def get_routine(routine_id: str):
    # Validate routine_id format to prevent path traversal attacks
    if not _validate_routine_id(routine_id):
        raise HTTPException(status_code=400, detail="Invalid routine_id format")
    
    routine = db.get_routine(routine_id)

    # If not in DB, check Supabase storage directly
    if not routine:
        print(f"[INFO] Routine {routine_id} not in DB, checking Supabase storage...")
        supabase_routine = _get_routine_from_supabase_storage(routine_id)
        if supabase_routine:
            # Create routine entry from Supabase storage
            routine = {
                "routine_id": routine_id,
                "title": "Routine",  # Default title, could be improved by querying Supabase DB
                "video_supabase_url": supabase_routine["video_url"],
                "audio_supabase_url": supabase_routine["audio_url"],
            }
            db.upsert_routine(routine_id, routine)
            print(f"[INFO] Found routine {routine_id} in Supabase storage and added to DB")
        else:
            raise HTTPException(status_code=404, detail="Routine not found")
    
    # Check processing status
    processing = routine.get("processing", False)
    status = routine.get("status", "completed" if routine.get("video_supabase_url") else "unknown")
    
    # Check for Supabase URLs first
    video_url = routine.get("video_supabase_url")
    audio_url = routine.get("audio_supabase_url")
    
    print(f"[INFO] Routine {routine_id} initial URLs: video={video_url[:50] if video_url else 'None'}..., audio={audio_url[:50] if audio_url else 'None'}...")
    
    # If Supabase URLs don't exist, try to migrate from local files
    if not video_url or not audio_url:
        video_path = routine.get("video_path")
        audio_path = routine.get("audio_path")
        
        if video_path and audio_path:
            # Try to upload local files to Supabase
            local_video_path = BASE_DIR / video_path.replace("\\", "/")
            local_audio_path = BASE_DIR / audio_path.replace("\\", "/")
            
            if local_video_path.exists() and local_audio_path.exists():
                # Upload to Supabase
                video_storage_path = f"routines/{routine_id}/video.mp4"
                audio_storage_path = f"routines/{routine_id}/audio.mp3"
                
                video_url = _upload_to_supabase_storage(local_video_path, "videos", video_storage_path)
                audio_url = _upload_to_supabase_storage(local_audio_path, "audio", audio_storage_path)
                
                # Update routine data with Supabase URLs
                if video_url and audio_url:
                    routine["video_supabase_url"] = video_url
                    routine["audio_supabase_url"] = audio_url
                    db.upsert_routine(routine_id, routine)
                    print(f"[INFO] Migrated routine {routine_id} to Supabase storage")
    
    if not video_url or not audio_url:
        # If still processing, return status without URLs
        if processing:
            return {
                "routine_id": routine_id,
                "title": routine.get("title"),
                "processing": True,
                "status": status,
                "video_url": None,
                "audio_url": None,
            }
        raise HTTPException(
            status_code=404,
            detail="Routine files not available. The routine files may have been deleted or Supabase storage is not configured."
        )

    response = {
        "routine_id": routine_id,
        "title": routine.get("title"),
        "video_url": video_url,
        "audio_url": audio_url,
        "processing": processing,
        "status": status,
        # Also include supabase_url keys for backwards compatibility
        "video_supabase_url": video_url,
        "audio_supabase_url": audio_url,
    }
    print(f"[INFO] Returning routine response with audio_url: {audio_url[:50] if audio_url else 'None'}...")
    return response


@api_router.get("/routines/{routine_id}/status")
def get_routine_status(routine_id: str):
    """Get the processing status of a routine"""
    # Validate routine_id format
    if not _validate_routine_id(routine_id):
        raise HTTPException(status_code=400, detail="Invalid routine_id format")
    routine = db.get_routine(routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    processing = routine.get("processing", False)
    status = routine.get("status", "completed" if routine.get("video_supabase_url") else "unknown")
    video_url = routine.get("video_supabase_url")
    audio_url = routine.get("audio_supabase_url")

    return {
        "routine_id": routine_id,
        "processing": processing,
        "status": status,
        "has_video": video_url is not None,
        "has_audio": audio_url is not None,
        "error": routine.get("error"),
    }


def _run_try_analysis(routine_id: str, user_video_path: Path, routine_video_path: Optional[Path] = None, original_supabase_url: Optional[str] = None, try_id: Optional[str] = None) -> Dict:
    routine = db.get_routine(routine_id)

    # If not in DB, check Supabase storage directly
    if not routine:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Routine {routine_id} not in DB, checking Supabase storage...")
        supabase_routine = _get_routine_from_supabase_storage(routine_id)
        if supabase_routine:
            # Create routine entry from Supabase storage
            routine = {
                "routine_id": routine_id,
                "title": "Routine",  # Default title
                "video_supabase_url": supabase_routine["video_url"],
                "audio_supabase_url": supabase_routine["audio_url"],
            }
            db.upsert_routine(routine_id, routine)
            logger.info(f"Found routine {routine_id} in Supabase storage and added to DB")
    
    # Use provided try_id or generate new one
    if not try_id:
        try_id = uuid.uuid4().hex
    
    # Use temporary directory for processing - will be cleaned up after upload
    temp_dir = Path(tempfile.mkdtemp(prefix=f"try_{try_id}_"))
    
    try:
        import logging
        logger = logging.getLogger(__name__)
        
        # Get routine video and audio URLs from Supabase
        routine_video_url = None
        routine_audio_url = None
        
        if routine:
            routine_video_url = routine.get("video_supabase_url")
            routine_audio_url = routine.get("audio_supabase_url")
            
            # If Supabase URLs don't exist, try to migrate from local files
            if not routine_video_url or not routine_audio_url:
                video_path = routine.get("video_path")
                audio_path = routine.get("audio_path")
                
                if video_path and audio_path:
                    # Try to upload local files to Supabase
                    local_video_path = BASE_DIR / video_path.replace("\\", "/")
                    local_audio_path = BASE_DIR / audio_path.replace("\\", "/")
                    
                    if local_video_path.exists() and local_audio_path.exists():
                        # Upload to Supabase
                        video_storage_path = f"routines/{routine_id}/video.mp4"
                        audio_storage_path = f"routines/{routine_id}/audio.mp3"
                        
                        routine_video_url = _upload_to_supabase_storage(local_video_path, "videos", video_storage_path)
                        routine_audio_url = _upload_to_supabase_storage(local_audio_path, "audio", audio_storage_path)
                        
                        # Update routine data with Supabase URLs
                        if routine_video_url and routine_audio_url:
                            routine["video_supabase_url"] = routine_video_url
                            routine["audio_supabase_url"] = routine_audio_url
                            db.upsert_routine(routine_id, routine)
                            logger.info(f"Migrated routine {routine_id} to Supabase storage")
        
        if not routine_video_url or not routine_audio_url:
            raise HTTPException(
                status_code=404,
                detail=f"Routine not found or files unavailable. Routine ID: {routine_id}. Please ensure the routine was created through the backend API and files are available."
            )
        
        # Download routine video if not provided (for background processing)
        # Note: In create_try, routine_video_path is downloaded once and passed here to avoid re-downloading
        # IMPORTANT: If routine_video_path is provided and exists, DO NOT download again - reuse it
        routine_audio_path = temp_dir / "routine_audio.mp3"
        video_needs_download = False
        
        if routine_video_path is None:
            # No path provided - need to download (background processing case)
            routine_video_path = temp_dir / "routine_video.mp4"
            video_needs_download = True
        elif not routine_video_path.exists():
            # Path provided but file doesn't exist - this shouldn't happen, but handle it
            logger.warning(f"⚠️ routine_video_path provided ({routine_video_path}) but file doesn't exist. Re-downloading.")
            routine_video_path = temp_dir / "routine_video.mp4"
            video_needs_download = True
        else:
            # Path provided and exists - reuse it (no download needed)
            logger.info(f"✅ Reusing provided routine_video_path: {routine_video_path} (no re-download needed)")
        
        if video_needs_download:
            # Download routine video (only if not provided from create_try)
            video_storage_path = routine_video_url.split("/storage/v1/object/public/videos/")[-1] if "/storage/v1/object/public/videos/" in routine_video_url else f"routines/{routine_id}/video.mp4"
            # Verify routine_id is correct when constructing audio path (matches how audio was uploaded)
            if "/storage/v1/object/public/audio/" in routine_audio_url:
                audio_storage_path = routine_audio_url.split("/storage/v1/object/public/audio/")[-1]
                expected_path = f"routines/{routine_id}/audio.mp3"
                if audio_storage_path != expected_path:
                    logger.warning(f"⚠️ Audio storage path mismatch: got '{audio_storage_path}', expected '{expected_path}' (routine_id: {routine_id}). Using path from URL.")
            else:
                audio_storage_path = f"routines/{routine_id}/audio.mp3"
            
            logger.info(f"Downloading routine video from Supabase: {video_storage_path}")
            video_downloaded = False
            audio_downloaded = False

            if SUPABASE_AVAILABLE and supabase_client:
                video_downloaded = _download_from_supabase_storage("videos", video_storage_path, routine_video_path)
                audio_downloaded = _download_from_supabase_storage("audio", audio_storage_path, routine_audio_path)

            if not video_downloaded:
                logger.info("Falling back to public URL download for routine video")
                video_downloaded = _download_file_from_url(routine_video_url, routine_video_path)

            if not audio_downloaded:
                logger.info("Falling back to public URL download for routine audio")
                audio_downloaded = _download_file_from_url(routine_audio_url, routine_audio_path)

            if not video_downloaded:
                logger.info("Falling back to local routine video file")
                local_video_source = _get_local_routine_file(routine, "video_path", "actual.mp4")
                if local_video_source:
                    shutil.copy2(local_video_source, routine_video_path)
                    video_downloaded = True

            if not audio_downloaded:
                logger.info("Falling back to local routine audio file")
                local_audio_source = _get_local_routine_file(routine, "audio_path", "audio.mp3")
                if local_audio_source:
                    shutil.copy2(local_audio_source, routine_audio_path)
                    audio_downloaded = True

            if not video_downloaded:
                raise HTTPException(status_code=500, detail="Failed to download routine video from Supabase storage")

            if not audio_downloaded:
                raise HTTPException(status_code=500, detail="Failed to download routine audio from Supabase storage")
        else:
            # routine_video_path provided - download audio only if needed
            # Verify routine_id is correct when constructing audio path
            if "/storage/v1/object/public/audio/" in routine_audio_url:
                audio_storage_path = routine_audio_url.split("/storage/v1/object/public/audio/")[-1]
                # Verify path matches expected format: routines/{routine_id}/audio.mp3
                expected_path = f"routines/{routine_id}/audio.mp3"
                if audio_storage_path != expected_path:
                    logger.warning(f"⚠️ Audio storage path mismatch in _run_try_analysis: got '{audio_storage_path}', expected '{expected_path}'. Using path from URL.")
            else:
                # Construct path from routine_id (matches how audio was uploaded)
                audio_storage_path = f"routines/{routine_id}/audio.mp3"
            
            audio_downloaded = False
            
            if SUPABASE_AVAILABLE and supabase_client:
                audio_downloaded = _download_from_supabase_storage("audio", audio_storage_path, routine_audio_path)
            
            if not audio_downloaded:
                audio_downloaded = _download_file_from_url(routine_audio_url, routine_audio_path)
            
            if not audio_downloaded:
                local_audio_source = _get_local_routine_file(routine, "audio_path", "audio.mp3")
                if local_audio_source:
                    shutil.copy2(local_audio_source, routine_audio_path)
                else:
                    raise HTTPException(status_code=500, detail=f"Failed to download routine audio from Supabase storage (routine_id: {routine_id}, path: {audio_storage_path})")
        
        # FAST CHECK #1: Compare Supabase URLs first (if user video was already uploaded)
        # This catches cases where the same video file is uploaded to the same location
        if original_supabase_url and routine_video_url:
            # Extract storage paths from URLs
            user_storage_path = original_supabase_url.split("/storage/v1/object/public/videos/")[-1] if "/storage/v1/object/public/videos/" in original_supabase_url else None
            routine_storage_path = routine_video_url.split("/storage/v1/object/public/videos/")[-1] if "/storage/v1/object/public/videos/" in routine_video_url else None
            
            # If storage paths match, videos are identical
            if user_storage_path and routine_storage_path and user_storage_path == routine_storage_path:
                logger.info("✅ Videos have identical Supabase storage paths! Returning perfect score immediately.")
                score = 100.0
                user_video_url = original_supabase_url
                
                # Store try result in DB
                try_data = {
                    "try_id": try_id,
                    "routine_id": routine_id,
                    "score": score,
                }
                if user_video_url:
                    try_data["user_video_supabase_url"] = user_video_url
                db.upsert_try(try_id, try_data)

                return {
                    "try_id": try_id,
                    "score": score,
                    "user_video_url": user_video_url,
                    "routine_video_url": routine_video_url,
                    "critique_url": None,
                    "comparison_url": None,
                }
        
        # FAST CHECK #2: Byte-identical check BEFORE compression (instant for identical videos)
        # NOTE: This check is redundant if called from create_try (which already does hash comparison).
        # Only do this check if we had to download the video ourselves (background processing case).
        # If routine_video_path was provided from create_try, hash comparison already happened there.
        try:
            # Only do hash check if we downloaded the video in this function (video_needs_download was True)
            # If routine_video_path was provided from create_try, skip this redundant check
            if video_needs_download and routine_video_path.exists() and user_video_path.exists():
                user_hash = _sha256(user_video_path)
                routine_hash = _sha256(routine_video_path)
                if user_hash == routine_hash:
                    logger.info("✅ Videos are byte-identical! Returning perfect score immediately.")
                    # Return immediately with perfect score - no processing needed
                    score = 100.0
                    # Still need to upload the video and return proper response
                    # But skip all expensive processing
                    user_video_url = original_supabase_url
                    if not user_video_url:
                        # Upload the raw video if not already uploaded
                        if SUPABASE_AVAILABLE and supabase_client:
                            storage_path = f"attempts/{try_id}/raw.mp4"
                            user_video_url = _upload_to_supabase_storage(user_video_path, "videos", storage_path)
                    
                    # Store try result in DB
                    try_data = {
                        "try_id": try_id,
                        "routine_id": routine_id,
                        "score": score,
                    }
                    if user_video_url:
                        try_data["user_video_supabase_url"] = user_video_url
                    db.upsert_try(try_id, try_data)
                    
                    return {
                        "try_id": try_id,
                        "score": score,
                        "user_video_url": user_video_url,
                        "routine_video_url": routine_video_url,
                        "critique_url": None,
                        "comparison_url": None,
                    }
            else:
                logger.debug(f"Skipping redundant hash check in _run_try_analysis (already done in create_try)")
        except Exception as hash_err:
            logger.warning(f"Byte-identical check failed (non-critical): {hash_err}, continuing with normal processing")
        
        # Set up temporary paths for processing
        try_paths = {
            "dir": temp_dir,
            "user_video": temp_dir / "user_video.mp4",
            "comparison": temp_dir / "comparison.mp4",
            "out_dir": temp_dir / "out",
            "critique_json": temp_dir / "out" / "critique.json",
            "critique_md": temp_dir / "out" / "critique.md",
        }
        try_paths["out_dir"].mkdir(parents=True, exist_ok=True)

        persistent_try_paths = _try_paths(try_id)
        persistent_try_paths["dir"].mkdir(parents=True, exist_ok=True)
        persistent_try_paths["out_dir"].mkdir(parents=True, exist_ok=True)

        # Normalize user video to MP4 with compression to reduce memory usage
        suffix = user_video_path.suffix.lower()
        original_size = user_video_path.stat().st_size
        logger.info(f"Processing user video: {user_video_path.name} (suffix: {suffix}, size: {original_size} bytes)")
        
        # REAL SKIP RULE: Check if video needs compression
        # If mp4 AND <10MB AND height ≤ 480, skip conversion completely
        size_mb = original_size / (1024 * 1024)
        needs_compression = _needs_video_conversion(user_video_path, max_resolution=480, max_size_mb=100)
        
        # Get video dimensions for debug output
        orig_width, orig_height = _get_video_dimensions(user_video_path)
        
        # Debug log for compression decision
        _debug_log(f"Compression decision: {'SKIPPED' if not needs_compression else 'ENCODED'}, orig_res={orig_width}x{orig_height}, orig_size_mb={size_mb:.2f}")
        
        if not needs_compression:
            logger.info(f"Video meets skip criteria (MP4, {size_mb:.1f}MB, ≤480p) - skipping conversion")
            # Just copy the file to the target location
            shutil.copy2(user_video_path, try_paths["user_video"])
        else:
            # Compress/convert to reduce memory usage during processing
            # This scales down to 480p and compresses, significantly reducing memory footprint
            try:
                if suffix == ".mp4":
                    compressed_path = temp_dir / "user_video_compressed.mp4"
                    logger.info("Compressing user video to 480p...")
                    _convert_to_mp4(user_video_path, compressed_path, max_resolution=480)
                    # Replace original with compressed version
                    user_video_path.unlink()  # Delete original
                    compressed_path.replace(try_paths["user_video"])  # Move compressed to final location
                    compressed_size = try_paths["user_video"].stat().st_size
                    logger.info(f"Video compressed: {original_size} -> {compressed_size} bytes ({100*compressed_size/original_size:.1f}% of original)")
                else:
                    logger.info(f"Converting {suffix} video to MP4 with compression (480p)...")
                    _convert_to_mp4(user_video_path, try_paths["user_video"], max_resolution=480)
                    logger.info("Video conversion completed successfully")
            except RuntimeError as exc:
                logger.error(f"Video processing failed: {exc}")
                raise HTTPException(status_code=500, detail=f"Video processing failed: {exc}") from exc
        # Extract pose sequences and compute score using MediaPipe-based pose analysis
        logger.info("=" * 60)
        logger.info("Using MediaPipe-based pose analysis")
        logger.info("=" * 60)
        # Try to load cached routine pose data first (major speedup!)
        ref_seq = None
        ref_frames = None
        ref_angles = None
        ref_valid = None
        ref_embeddings = None
        ref_visibility = None
        
        # NOTE: Use a versioned cache key so we don't reuse any legacy
        # optical-flow-based pose caches that may exist in storage.
        cached_pose_path = f"routines/{routine_id}/pose_data_v2.json"
        logger.info(f"Checking for cached pose data (v2): {cached_pose_path}")
        
        # Try to load from Supabase storage first
        cached_loaded = False
        if SUPABASE_AVAILABLE and supabase_client:
            try:
                # Try to download cached pose data (use "videos" bucket to match upload)
                cached_temp_path = temp_dir / "cached_pose_data.json"
                downloaded = _download_from_supabase_storage("videos", cached_pose_path, cached_temp_path)
                if downloaded and cached_temp_path.exists():
                    import json
                    import numpy as np
                    with cached_temp_path.open('r') as f:
                        cached_data = json.load(f)
                    # Convert back to numpy arrays
                    ref_seq = [np.array(frame) for frame in cached_data['seq']]
                    ref_angles = [np.array(angles) for angles in cached_data['angles']]
                    ref_valid = cached_data['valid']
                    ref_embeddings = [np.array(emb) for emb in cached_data['embeddings']]
                    ref_visibility = [np.array(vis) for vis in cached_data['visibility']]
                    ref_frames = []  # Not stored in cache
                    cached_loaded = True
                    logger.info(f"✅ Loaded cached pose data for routine {routine_id} ({len(ref_seq)} frames)")
            except Exception as cache_err:
                logger.warning(f"Failed to load cached pose data: {cache_err}, will extract fresh")
        
        # If cache miss, extract pose data and cache it
        if not cached_loaded:
            logger.info(f"Extracting pose keypoints from reference video: {routine_video_path}")
            # Use consistent frame skipping for deterministic results
            # frame_skip=2 for routine (process every 2nd frame - consistent across environments)
            # This ensures same frames are processed locally and on Render
            # Time pose extraction
            pose_start = time.time()
            ref_seq, ref_frames, ref_angles, ref_valid, ref_embeddings, ref_visibility = extract_pose_keypoints(
                str(routine_video_path),
                store_frames=True,  # Store frames so we can create side-by-side comparison
                frame_skip=2,  # Process every 2nd frame for routine (consistent, deterministic)
            )
            pose_time = time.time() - pose_start
            _debug_log(f"pose_time={pose_time:.3f}s (reference)")
            ref_valid_count = len([v for v in ref_valid if v])
            logger.info(f"Reference video: extracted {len(ref_seq)} frames, {ref_valid_count} valid frames")
            
            # Cache the pose data for future use
            if SUPABASE_AVAILABLE and supabase_client:
                try:
                    import json
                    import numpy as np
                    # Convert numpy arrays to lists for JSON serialization
                    cache_data = {
                        'seq': [frame.tolist() if isinstance(frame, np.ndarray) else frame for frame in ref_seq],
                        'angles': [angles.tolist() if isinstance(angles, np.ndarray) else angles for angles in ref_angles],
                        'valid': ref_valid,
                        'embeddings': [emb.tolist() if isinstance(emb, np.ndarray) else emb for emb in ref_embeddings],
                        'visibility': [vis.tolist() if isinstance(vis, np.ndarray) else vis for vis in ref_visibility],
                    }
                    cache_temp_path = temp_dir / "pose_cache.json"
                    with cache_temp_path.open('w') as f:
                        json.dump(cache_data, f)
                    
                    # Upload to Supabase storage (use "videos" bucket to match download)
                    _upload_to_supabase_storage(cache_temp_path, "videos", cached_pose_path)
                    logger.info(f"✅ Cached pose data for routine {routine_id}")
                except Exception as cache_err:
                    logger.warning(f"Failed to cache pose data: {cache_err} (non-critical)")
        
        ref_valid_count = len([v for v in ref_valid if v])
        
        logger.info(f"Extracting pose keypoints from user video: {try_paths['user_video']}")
        # Use consistent frame skipping for deterministic results
        # frame_skip=2 for user video (process every 2nd frame - same as routine)
        # This ensures consistent frame alignment and scoring across environments
        # Time pose extraction
        pose_start = time.time()
        user_seq, user_frames, user_angles, user_valid, user_embeddings, user_visibility = extract_pose_keypoints(
            str(try_paths["user_video"]),
            store_frames=True,  # Store frames so we can create side-by-side comparison
            frame_skip=2,  # Process every 2nd frame (consistent with routine, deterministic)
        )
        pose_time = time.time() - pose_start
        _debug_log(f"pose_time={pose_time:.3f}s (user)")
        user_valid_count = len([v for v in user_valid if v])
        logger.info(f"User video: extracted {len(user_seq)} frames, {user_valid_count} valid frames")

        if len(ref_seq) == 0:
            raise HTTPException(status_code=500, detail="Failed to extract motion features from reference video. The video may be corrupted or empty.")
        
        if len(user_seq) == 0:
            raise HTTPException(status_code=500, detail="Failed to extract motion features from user video. The video may be corrupted or empty.")
        
        if len(ref_seq) < 5:
            logger.warning(f"Very few frames in reference video: {len(ref_seq)} frames")
        
        if len(user_seq) < 5:
            logger.warning(f"Very few frames in user video: {len(user_seq)} frames")

        _, _, fps_ref = get_video_length(str(routine_video_path))
        _, _, fps_user = get_video_length(str(try_paths["user_video"]))
        logger.info(f"Video FPS: reference={fps_ref}, user={fps_user}")

        logger.info("Computing alignment and score...")
        logger.info(f"Reference: {len(ref_seq)} frames, {len(ref_valid)} valid, {fps_ref:.2f} fps")
        logger.info(f"User: {len(user_seq)} frames, {len(user_valid)} valid, {fps_user:.2f} fps")
        # [DEBUG] Time DTW alignment
        dtw_start = time.time()
        result = align_and_score(
            ref_seq,
            user_seq,
            ref_angles,
            user_angles,
            ref_valid,
            user_valid,
            fps_ref,
            fps_user,
            ref_embeddings,
            user_embeddings,
            ref_visibility,
            user_visibility,
        )
        dtw_time = time.time() - dtw_start
        _debug_log(f"dtw_time={dtw_time:.3f}s")
        # Use score directly from align_and_score (matches notebook logic)
        score = float(result.get("score", 0))
        logger.info(f"Computed score: {score}")
        logger.info(f"Score breakdown - base: {result.get('global_stats', {}).get('avg_similarity', 0)*100:.1f}%, path length: {len(result.get('path', []))}")
        
        # Get average similarity from result for logging
        avg_similarity = result.get("global_stats", {}).get("avg_similarity", 0.0)
        if avg_similarity > 0:
            logger.info(f"Average frame similarity from alignment: {avg_similarity:.3f}")

        # Only check for byte-identical videos (legitimate edge case)
        try:
            if routine_video_path.exists() and try_paths["user_video"].exists():
                routine_hash_compressed = _sha256(routine_video_path)
                user_hash_compressed = _sha256(try_paths["user_video"])
                if routine_hash_compressed == user_hash_compressed:
                    logger.info("✅ Videos are byte-identical after compression! Returning perfect score.")
                    score = 100.0
        except Exception as compressed_hash_err:
            logger.debug(f"Compressed hash check failed (non-critical): {compressed_hash_err}")

        # If model returns [0,1] scale, upscale to [0,100] (safety check)
        try:
            if 0.0 <= score <= 1.5:
                score = score * 100.0
        except Exception:
            pass

        # Clamp score to [0, 100] and round to 1 decimal place for consistency
        if not isinstance(score, (int, float)):
            score = 0.0
        score = round(max(0.0, min(100.0, float(score))), 1)

        # Generate side-by-side comparison video (reference vs user), aligned
        # using the same DTW path that was used for scoring. This keeps the
        # visual timing consistent with the score/critique alignment.
        comparison_video_created = False
        try:
            if ref_frames and user_frames:
                logger.info("Creating side-by-side comparison video (DTW-aligned)...")
                alignment_path = result.get("path") or []
                create_side_by_side(
                    ref_frames,
                    user_frames,
                    str(routine_audio_path),
                    output_path=str(try_paths["comparison"]),
                    fps=fps_ref,
                    alignment_path=alignment_path,
                )
                comparison_video_created = True
                logger.info("✅ Comparison video created successfully")
            else:
                logger.info("Skipping comparison video creation (no frames available)")
        except Exception as cmp_err:
            logger.error(f"Failed to create comparison video (non-critical): {cmp_err}")
            comparison_video_created = False
        
        # Generate critique JSON + Markdown docs using alignment result
        critique_generated = False
        try:
            events = result.get("events") or []
            summary = {
                "score": score,
                "thresholds": result.get("thresholds", {}) or {},
                "performance_mode": result.get("performance_mode"),
                "global_stats": result.get("global_stats") or {},
            }
            if events:
                logger.info("Generating critique JSON and Markdown docs...")
                write_json(str(try_paths["critique_json"]), {
                    "score": score,
                    "thresholds": summary["thresholds"],
                    "events": events,
                    "global_stats": summary["global_stats"],
                    "performance_mode": summary["performance_mode"],
                })
                write_markdown(str(try_paths["critique_md"]), summary, events)
                critique_generated = True
                logger.info("✅ Critique docs generated successfully")
            else:
                logger.info("No critique events returned from model – skipping critique doc generation")
        except Exception as crit_err:
            logger.error(f"Failed to generate critique docs (non-critical): {crit_err}")

        # Skip remuxing - video was already remuxed with routine audio in /tries endpoint before upload
        # The video downloaded from Supabase already has routine audio, so no need to remux again
        remux_successful = True
        logger.info("✅ Video already has routine audio (remuxed in /tries endpoint), skipping remux step")
        
        # Free memory from routine video files after all processing is done
        # (routine_video_path and routine_audio_path are no longer needed)
        del routine_video_path, routine_audio_path
        gc.collect()
        logger.info("Freed memory from routine video files")

        # Free memory from frame data IMMEDIATELY after score computation
        # This is critical to stay under 512MB limit
        try:
            del ref_frames, user_frames, ref_seq, user_seq, ref_angles, user_angles
            del ref_valid, user_valid, ref_embeddings, user_embeddings
            del ref_visibility, user_visibility, result
        except NameError:
            # Some variables might not exist, that's okay
            pass
        gc.collect()
        logger.info("Freed memory from frame data and analysis results")

        # Upload generated files to Supabase storage
        comparison_url = None
        critique_json_url = None
        critique_md_url = None
        user_video_url = None
        
        # Upload comparison video only if it was created
        if comparison_video_created and try_paths["comparison"].exists():
            if SUPABASE_AVAILABLE and supabase_client:
                comparison_storage_path = f"attempts/{try_id}/comparison.mp4"
                comparison_url = _upload_to_supabase_storage(
                    try_paths["comparison"],
                    "videos",
                    comparison_storage_path
                )
            if not comparison_url:
                comparison_url = _persist_file_to_static(
                    try_paths["comparison"],
                    persistent_try_paths["comparison"],
                )
        
        # Upload critique files if they were generated
        if critique_generated and try_paths["critique_json"].exists():
            if SUPABASE_AVAILABLE and supabase_client:
                critique_json_storage_path = f"attempts/{try_id}/critique.json"
                critique_json_url = _upload_to_supabase_storage(
                    try_paths["critique_json"],
                    "videos",
                    critique_json_storage_path
                )
            if not critique_json_url:
                critique_json_url = _persist_file_to_static(
                    try_paths["critique_json"],
                    persistent_try_paths["critique_json"],
                )
        
        if critique_generated and try_paths["critique_md"].exists():
            if SUPABASE_AVAILABLE and supabase_client:
                critique_md_storage_path = f"attempts/{try_id}/critique.md"
                critique_md_url = _upload_to_supabase_storage(
                    try_paths["critique_md"],
                    "videos",
                    critique_md_storage_path
                )
            if not critique_md_url:
                critique_md_url = _persist_file_to_static(
                    try_paths["critique_md"],
                    persistent_try_paths["critique_md"],
                )
        
        # Upload the processed user video (with routine audio remuxed in)
        # This is the final version that should be used, not the original
        # Always upload the processed/remuxed version if it exists
        if try_paths["user_video"].exists():
            file_size = try_paths["user_video"].stat().st_size
            logger.info(f"Uploading processed user video with routine audio (size: {file_size} bytes)...")
            if SUPABASE_AVAILABLE and supabase_client:
                # Use processed.mp4 to distinguish from raw.mp4
                processed_storage_path = f"attempts/{try_id}/processed.mp4"
                user_video_url = _upload_to_supabase_storage(
                    try_paths["user_video"],
                    "videos",
                    processed_storage_path
                )
                if user_video_url:
                    logger.info(f"✅ Uploaded processed video with routine audio: {user_video_url}")
            if not user_video_url:
                # Fallback to static file storage
                user_video_url = _persist_file_to_static(
                    try_paths["user_video"],
                    persistent_try_paths["user_video"],
                )
                logger.info(f"✅ Saved processed video to static storage: {user_video_url}")
        
        # If video processing/remuxing failed, fall back to original upload
        # But log a warning since it won't have routine audio
        if not user_video_url:
            if original_supabase_url:
                logger.warning("⚠️ Using original uploaded video (remuxing may have failed - video won't have routine audio)")
                user_video_url = original_supabase_url
            else:
                logger.error("❌ No video URL available - both processed and original upload failed")

        # Store try metadata in DB with ONLY Supabase URLs (no local paths)
        try_data = {
            "try_id": try_id,
            "routine_id": routine_id,
            "score": score,
        }

        # Add Supabase URLs (required - fail if uploads didn't succeed)
        if comparison_url:
            try_data["comparison_supabase_url"] = comparison_url
        if user_video_url:
            try_data["user_video_supabase_url"] = user_video_url
        if critique_json_url:
            try_data["critique_json_supabase_url"] = critique_json_url
        if critique_md_url:
            try_data["critique_md_supabase_url"] = critique_md_url

        # Only require user_video_url (score is already computed)
        # Comparison video is optional (skipped to save memory)
        # Critique files are optional (may fail if memory is tight)
        if not user_video_url:
            raise HTTPException(
                status_code=500,
                detail="Failed to upload user video. Please try again."
            )

        db.upsert_try(try_id, try_data)

        # Return results (only score and video URLs - critique/comparison skipped to save memory)
        return {
            "try_id": try_id,
            "score": score,
            "user_video_url": user_video_url,
            "routine_video_url": routine_video_url,  # Routine video URL from Supabase
            # Prefer Markdown critique URL when available
            "critique_url": critique_md_url or critique_json_url,
            "comparison_url": comparison_url,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Try analysis failed: {exc}") from exc
    finally:
        # Clean up ALL local files after processing (whether successful or not)
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            import logging
            logging.getLogger(__name__).info(f"✅ Successfully cleaned up temporary files for try_id: {try_id}")
        except Exception as cleanup_err:
            import logging
            logging.getLogger(__name__).warning(f"Failed to clean up temporary directory {temp_dir}: {cleanup_err}")


def _process_try_async(routine_id: str, temp_path: Path, user_video_supabase_url: Optional[str], try_id: str):
    """Process try analysis in background thread"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Update status to processing in DB
    try:
        existing = db.get_try(try_id) or {"routine_id": routine_id}
        existing["routine_id"] = existing.get("routine_id") or routine_id
        existing["processing"] = True
        existing["score"] = None
        db.upsert_try(try_id, existing)
    except Exception as status_err:
        logger.warning(f"[Background] Failed to update status: {status_err}")
    
    try:
        logger.info(f"[Background] Starting async try analysis for routine: {routine_id}, try_id: {try_id}")
        # Note: Background processing needs to download routine video itself
        # For now, pass None and let _run_try_analysis download it (will be optimized later)
        result = _run_try_analysis(routine_id, temp_path, None, user_video_supabase_url, try_id)
        score = result.get('score')
        logger.info(f"[Background] Try analysis completed. Try ID: {try_id}, Score: {score}")
        
        # Update try in DB with score (this is the source of truth)
        try:
            existing = db.get_try(try_id) or {}
            existing["score"] = score
            existing["processing"] = False
            if result.get('user_video_url'):
                existing["user_video_supabase_url"] = result.get('user_video_url')
            db.upsert_try(try_id, existing)
            logger.info(f"[Background] Updated DB with score: {score}")
        except Exception as index_err:
            logger.error(f"[Background] Failed to update DB: {index_err}")
        
        # Update video in Supabase with score when processing completes
        if SUPABASE_AVAILABLE and supabase_client and score is not None:
            try:
                # Find videos by routine_id and video_url (from result)
                video_url = result.get('user_video_url')
                if video_url:
                    # Update videos table - find by video_url
                    videos_result = supabase_client.table('videos').update({
                        'ai_score': round(score)
                    }).eq('video_url', video_url).execute()
                    
                    if videos_result.data:
                        logger.info(f"[Background] Updated {len(videos_result.data)} video(s) with score: {score}")
                    
                    # Update attempts table - find by video_url
                    attempts_result = supabase_client.table('attempts').update({
                        'ai_score': round(score)
                    }).eq('video_url', video_url).execute()
                    
                    if attempts_result.data:
                        logger.info(f"[Background] Updated {len(attempts_result.data)} attempt(s) with score: {score}")
                else:
                    logger.warning(f"[Background] No video_url in result, cannot update score")
            except Exception as update_err:
                logger.error(f"[Background] Failed to update video with score: {update_err}")
    except Exception as e:
        import traceback
        logger.error(f"[Background] Error in async try processing: {str(e)}")
        traceback.print_exc()
        
        # Update status to failed in DB
        try:
            existing = db.get_try(try_id) or {"routine_id": routine_id}
            existing["routine_id"] = existing.get("routine_id") or routine_id
            existing["processing"] = False
            existing["error"] = str(e)
            db.upsert_try(try_id, existing)
        except Exception:
            pass
    finally:
        # Clean up temporary file
        try:
            if temp_path.exists():
                temp_path.unlink()
                logger.info(f"[Background] Cleaned up temporary file: {temp_path}")
        except Exception as cleanup_err:
            logger.warning(f"[Background] Failed to cleanup temp file: {cleanup_err}")


@api_router.post("/tries")
async def create_try(
    background_tasks: BackgroundTasks,
    routine_id: str = Form(...),
    user_video: UploadFile = File(...),
    remux: bool = Form(False),  # Default: no remuxing (only if generating side-by-side)
):
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    try:
        # Validate routine_id format to prevent path traversal attacks
        if not _validate_routine_id(routine_id):
            raise HTTPException(status_code=400, detail="Invalid routine_id format")
        
        logger.info(f"Received try request for routine_id: {routine_id}, video: {user_video.filename}, remux: {remux}")
        _require_video(user_video)

        suffix = Path(user_video.filename or "").suffix.lower()
        # Accept .webm files (recorded in app)
        if suffix not in ALLOWED_VIDEO_SUFFIXES:
            # Allow .webm even if not in list (it's recorded in the app)
            if suffix == ".webm":
                pass  # Keep .webm
            else:
                suffix = ".mp4"
        temp_fd, temp_name = tempfile.mkstemp(suffix=suffix)
        os.close(temp_fd)
        temp_path = Path(temp_name)
        await run_in_threadpool(_save_upload, user_video, temp_path)
        logger.info(f"Saved uploaded video to: {temp_path}")
        
        # DURATION CHECK: Reject videos longer than 1 minute (60 seconds)
        try:
            video_duration, _, _ = get_video_length(str(temp_path))
            if video_duration > 60.0:  # 1 minute = 60 seconds
                temp_path.unlink()  # Clean up temp file
                raise HTTPException(
                    status_code=413,
                    detail=f"Video too long: {video_duration:.1f} seconds. Maximum duration is 60 seconds (1 minute)."
                )
            logger.info(f"Video duration: {video_duration:.2f} seconds (within 60s limit)")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
            logger.warning(f"Could not check video duration: {e}. Proceeding with upload.")

        # Get routine audio URL and remux video with routine audio before uploading
        try_id = uuid.uuid4().hex
        user_video_supabase_url = None
        
        # Get routine data to find audio URL
        routine = db.get_routine(routine_id)
        if not routine:
            raise HTTPException(status_code=404, detail=f"Routine not found: {routine_id}")

        routine_audio_url = routine.get("audio_supabase_url")
        if not routine_audio_url:
            # Try to get from local files and migrate to Supabase
            audio_path = routine.get("audio_path")
            if audio_path:
                local_audio_path = BASE_DIR / audio_path.replace("\\", "/")
                if local_audio_path.exists():
                    audio_storage_path = f"routines/{routine_id}/audio.mp3"
                    routine_audio_url = await run_in_threadpool(
                        _upload_to_supabase_storage, local_audio_path, "audio", audio_storage_path
                    )
                    if routine_audio_url:
                        routine["audio_supabase_url"] = routine_audio_url
                        db.upsert_routine(routine_id, routine)
        
        # FAST CHECK #1: Check if we've already analyzed this exact video for this routine
        # This ensures consistent scores across deployments - same video always gets same score
        # We check by comparing with routine video first (fastest), then check existing attempts
        cached_score = None
        cached_video_url = None
        
        # Download routine video once and reuse for analysis
        routine_video_url = routine.get("video_supabase_url")
        routine_video_path = None
        
        if routine_video_url:
            # Create temp directory for routine video (will be reused in analysis)
            routine_temp_dir = Path(tempfile.mkdtemp(prefix=f"routine_{routine_id}_"))
            routine_video_path = routine_temp_dir / "routine_video.mp4"
            
            # Extract storage path from Supabase URL
            video_storage_path = routine_video_url.split("/storage/v1/object/public/videos/")[-1] if "/storage/v1/object/public/videos/" in routine_video_url else f"routines/{routine_id}/video.mp4"
            
            logger.info(f"Downloading routine video from Supabase: {video_storage_path}")
            routine_downloaded = False
            
            if SUPABASE_AVAILABLE and supabase_client:
                routine_downloaded = await run_in_threadpool(
                    _download_from_supabase_storage, "videos", video_storage_path, routine_video_path
                )
            
            if not routine_downloaded:
                routine_downloaded = await run_in_threadpool(
                    _download_file_from_url, routine_video_url, routine_video_path
                )
            
            if not routine_downloaded or not routine_video_path.exists():
                raise HTTPException(status_code=500, detail="Failed to download routine video from Supabase storage")
            
            # FAST CHECK: Compare with routine video
            try:
                user_hash = await run_in_threadpool(_sha256, temp_path)
                routine_hash = await run_in_threadpool(_sha256, routine_video_path)
                logger.info(f"Comparing videos: user_hash={user_hash[:16]}..., routine_hash={routine_hash[:16]}...")
                
                if routine_hash == user_hash:
                    logger.info("✅ Uploaded video is identical to routine video! Returning perfect score immediately.")
                    cached_score = 100.0
            except Exception as routine_check_err:
                logger.debug(f"Routine hash check failed (non-critical): {routine_check_err}")
        
        # If we found a match with routine video, return immediately
        if cached_score is not None:
            logger.info(f"✅ Using perfect score {cached_score} for identical video (ensures consistency across deployments)")
            # Upload raw video to Supabase
            user_video_supabase_url_final = None
            if SUPABASE_AVAILABLE and supabase_client:
                storage_path = f"attempts/{try_id}/raw.mp4"
                user_video_supabase_url_final = await run_in_threadpool(
                    _upload_to_supabase_storage, temp_path, "videos", storage_path
                )
            
            # Clean up routine video temp directory if we created it
            if routine_video_path and routine_video_path.parent.name.startswith(f"routine_{routine_id}_"):
                try:
                    import shutil
                    shutil.rmtree(routine_video_path.parent, ignore_errors=True)
                except:
                    pass
            
            # Store try result in DB
            try_data = {
                "try_id": try_id,
                "routine_id": routine_id,
                "score": cached_score,
            }
            if user_video_supabase_url_final:
                try_data["user_video_supabase_url"] = user_video_supabase_url_final
            db.upsert_try(try_id, try_data)
            
            return JSONResponse({
                "try_id": try_id,
                "score": cached_score,
                "user_video_url": user_video_supabase_url_final,
                "routine_video_url": routine.get("video_supabase_url"),
                "critique_url": None,
                "comparison_url": None,
                "processing": False,  # Already complete
            })
        
        # Remux video with routine audio ONLY if remux flag is True (for side-by-side rendering)
        # Note: Hash comparison already done above using routine_video_path - no duplicate download needed
        remuxed_video_path = None
        if remux and routine_audio_url:
            try:
                # Create temp directory for remuxing
                remux_temp_dir = Path(tempfile.mkdtemp())
                routine_audio_path = remux_temp_dir / "routine_audio.mp3"
                # Always use .mp4 extension for remuxed video (ffmpeg will convert if needed)
                remuxed_video_path = remux_temp_dir / "remuxed.mp4"
                
                # Download routine audio
                logger.info(f"Downloading routine audio for remuxing: {routine_audio_url}")
                audio_downloaded = False
                if SUPABASE_AVAILABLE and supabase_client:
                    # Extract storage path from URL
                    if "/storage/v1/object/public/audio/" in routine_audio_url:
                        audio_storage_path = routine_audio_url.split("/storage/v1/object/public/audio/")[-1]
                        audio_downloaded = await run_in_threadpool(
                            _download_from_supabase_storage, "audio", audio_storage_path, routine_audio_path
                        )
                
                if not audio_downloaded:
                    audio_downloaded = await run_in_threadpool(
                        _download_file_from_url, routine_audio_url, routine_audio_path
                    )
                
                if audio_downloaded and routine_audio_path.exists():
                    # Remux video with routine audio
                    logger.info(f"Remuxing attempt video with routine audio (input: {temp_path}, output: {remuxed_video_path})...")
                    remux_success = await run_in_threadpool(
                        _remux_video_with_routine_audio, temp_path, routine_audio_path, remuxed_video_path, logger
                    )
                    
                    if remux_success and remuxed_video_path.exists():
                        logger.info(f"✅ Successfully remuxed video with routine audio ({remuxed_video_path.stat().st_size} bytes)")
                        # Use remuxed video for upload
                        temp_path = remuxed_video_path
                    else:
                        logger.warning("⚠️ Remuxing failed, will upload original video")
                        # Clean up failed remux attempt
                        if remuxed_video_path.exists():
                            remuxed_video_path.unlink()
                else:
                    logger.warning(f"⚠️ Could not download routine audio (downloaded: {audio_downloaded}, exists: {routine_audio_path.exists() if routine_audio_path else False}), will upload original video")
            except Exception as remux_err:
                import traceback
                logger.error(f"Error during remuxing: {remux_err}")
                traceback.print_exc()
                # Continue with original video if remuxing fails
        elif not routine_audio_url:
            logger.warning(f"⚠️ Routine audio URL not found for routine {routine_id}, will upload original video")
        
        # Upload raw video to Supabase first
        raw_video_url = None
        if SUPABASE_AVAILABLE and supabase_client:
            try:
                storage_path = f"attempts/{try_id}/raw.mp4"
                logger.info(f"Uploading raw video to Supabase: {storage_path}")
                raw_video_url = await run_in_threadpool(
                    _upload_to_supabase_storage,
                    temp_path,
                    "videos",
                    storage_path
                )
                if raw_video_url:
                    logger.info(f"✅ Raw video uploaded: {raw_video_url}")
            except Exception as upload_err:
                logger.error(f"Error uploading raw video to Supabase: {upload_err}")
        
        # Upload processed video (remuxed version if available, otherwise will be uploaded after processing)
        user_video_supabase_url = raw_video_url  # Default to raw video URL
        if SUPABASE_AVAILABLE and supabase_client and remuxed_video_path and remuxed_video_path.exists():
            try:
                video_to_upload = remuxed_video_path
                storage_path = f"attempts/{try_id}/processed.mp4"
                logger.info(f"Uploading processed video to Supabase: {storage_path}")
                user_video_supabase_url = await run_in_threadpool(
                    _upload_to_supabase_storage,
                    video_to_upload,
                    "videos",
                    storage_path
                )
                if user_video_supabase_url:
                    logger.info(f"✅ Video uploaded to Supabase: {user_video_supabase_url}")
                else:
                    logger.warning("⚠️ Failed to upload video to Supabase, will upload after processing")
            except Exception as upload_err:
                logger.error(f"Error uploading video to Supabase: {upload_err}")
                # Continue - will process and upload later

        # Process synchronously - wait for score before returning
        logger.info(f"Starting synchronous processing for try_id: {try_id}")
        logger.info("Processing video and computing score (this may take a moment)...")
        
        # Ensure routine_video_path exists (should have been downloaded above)
        if not routine_video_path or not routine_video_path.exists():
            raise HTTPException(status_code=500, detail="Routine video not available for analysis")
        
        # Run analysis synchronously - this will compute the score (pass routine_video_path to avoid re-downloading)
        analysis_result = _run_try_analysis(routine_id, temp_path, routine_video_path, raw_video_url, try_id)
        
        score = analysis_result.get('score')
        logger.info(f"✅ Processing completed. Try ID: {try_id}, Score: {score}")
        
        # Return with score and any generated assets (comparison video, critique docs)
        result = {
            "try_id": try_id,
            "score": score,
            "user_video_url": user_video_supabase_url,
            "routine_video_url": analysis_result.get('routine_video_url'),
            # Prefer Markdown critique URL when available (matches _run_try_analysis)
            "critique_url": analysis_result.get('critique_url'),
            "comparison_url": analysis_result.get('comparison_url'),
            "processing": False,  # Processing is complete
        }
        
        logger.info(f"✅ Returning with score: {score}")
        
        # Clean up routine video temp directory
        if routine_video_path and routine_video_path.parent.name.startswith(f"routine_{routine_id}_"):
            try:
                import shutil
                shutil.rmtree(routine_video_path.parent, ignore_errors=True)
            except:
                pass
        
        return JSONResponse(result)
    except HTTPException as he:
        logger.error(f"HTTPException in create_try: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        import traceback
        logger.error(f"Exception in create_try: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing try: {str(e)}")


@api_router.get("/tries/{try_id}")
def get_try(try_id: str):
    # Validate try_id format (same as routine_id - 32 hex chars)
    if not _validate_routine_id(try_id):
        raise HTTPException(status_code=400, detail="Invalid try_id format")
    
    attempt = db.get_try(try_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Try not found")

    # Return status and data
    score = attempt.get("score")
    user_video_url = attempt.get("user_video_supabase_url")
    
    # Check if processing is complete (has score) or still in progress
    processing = score is None
    
    result = {
        "try_id": try_id,
        "routine_id": attempt["routine_id"],
        "score": score,
        "user_video_url": user_video_url,
        "processing": processing,
        "routine_video_url": None,  # Routine video URL should be fetched from routine endpoint
    }
    
    # Only include optional fields if they exist
    comparison_url = attempt.get("comparison_supabase_url")
    critique_url = attempt.get("critique_md_supabase_url")
    
    if comparison_url:
        result["comparison_url"] = comparison_url
    if critique_url:
        result["critique_url"] = critique_url
    
    if not user_video_url:
        raise HTTPException(
            status_code=404,
            detail="Try video not available in Supabase storage."
        )

    return result


@api_router.get("/tries/{try_id}/status")
def get_try_status(try_id: str):
    """Get the processing status of a try attempt"""
    # Validate try_id format (same as routine_id - 32 hex chars)
    if not _validate_routine_id(try_id):
        raise HTTPException(status_code=400, detail="Invalid try_id format")
    attempt = db.get_try(try_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Try not found")

    score = attempt.get("score")
    processing = score is None

    return {
        "try_id": try_id,
        "processing": processing,
        "score": score,
        "has_video": attempt.get("user_video_supabase_url") is not None,
    }


@api_router.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "supabase_available": SUPABASE_AVAILABLE
    }

_API_KEY = os.getenv("API_KEY", "")

def _require_api_key(request: Request):
    """Optional API key guard. If API_KEY env var is set, enforce it via X-API-Key header."""
    if not _API_KEY:
        return  # No key configured → open access (dev mode)
    provided = request.headers.get("X-API-Key", "")
    if not provided or provided != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@api_router.get("/metrics", dependencies=[Depends(_require_api_key)])
def get_metrics():
    """Get request metrics for monitoring (protected by X-API-Key when API_KEY env var is set)"""
    with _metrics_lock:
        processing_times = _request_metrics["processing_times"]
        avg_time = sum(processing_times) / len(processing_times) if processing_times else 0
        max_time = max(processing_times) if processing_times else 0
        min_time = min(processing_times) if processing_times else 0
        
        return {
            "total_requests": _request_metrics["total_requests"],
            "errors": _request_metrics["errors"],
            "error_rate": round(_request_metrics["errors"] / max(_request_metrics["total_requests"], 1), 4),
            "avg_processing_time": round(avg_time, 3),
            "max_processing_time": round(max_time, 3),
            "min_processing_time": round(min_time, 3),
            "error_types": _request_metrics["error_types"],
        }

@api_router.get("/tries/test")
def test_tries_endpoint():
    return {"message": "Tries endpoint is accessible", "routes": ["POST /api/tries", "GET /api/tries/{try_id}"]}


# Add root route to avoid 404s on health checks
@app.get("/")
def root():
    return {
        "message": "Groovely API",
        "status": "running",
        "endpoints": {
            "health": "/api/health",
            "routines": "/api/routines",
            "tries": "/api/tries"
        }
    }

# Add health check at root level for platform health checks (Render, Railway, etc.)
@app.get("/health")
def root_health():
    """Root-level health check endpoint"""
    return {"status": "ok", "service": "Groovely API"}

# Add OPTIONS handler for CORS preflight requests
@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle CORS preflight requests"""
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600",
        }
    )


# Add exception handlers to ensure CORS headers are always sent
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger = logging.getLogger(__name__)
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    # Track error in metrics
    with _metrics_lock:
        _request_metrics["errors"] += 1
        error_type = type(exc).__name__
        _request_metrics["error_types"][error_type] = _request_metrics["error_types"].get(error_type, 0) + 1
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={"Access-Control-Allow-Origin": "*"}
    )

app.include_router(api_router)

