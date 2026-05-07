import cv2
import numpy as np
from scipy.spatial.distance import euclidean
import os
import time
import subprocess
import json
from typing import Callable, List, Optional, Sequence, Tuple, Dict, Union
from collections import Counter

# --- Optional dependencies (we keep your graceful fallbacks) ------------------
try:
    import pygame
    PYGAME_AVAILABLE = True
except Exception:
    PYGAME_AVAILABLE = False
    pygame = None

# MediaPipe for 2D pose keypoints (preferred path)
try:
    import mediapipe as mp  # type: ignore

    MEDIAPIPE_AVAILABLE = True
    mp_pose = mp.solutions.pose
    print(f"[dance.py] ✅ MediaPipe {mp.__version__} loaded successfully")
except Exception as _mp_err:
    MEDIAPIPE_AVAILABLE = False
    mp_pose = None
    print(f"[dance.py] ❌ MediaPipe import failed: {type(_mp_err).__name__}: {_mp_err}")

try:
    from fastdtw import fastdtw
    FASTDTW_AVAILABLE = True
except Exception:
    FASTDTW_AVAILABLE = False

try:
    import librosa
    LIBROSA_AVAILABLE = True
except Exception:
    LIBROSA_AVAILABLE = False

# Try to get ffmpeg from imageio-ffmpeg, fallback to system ffmpeg
try:
    from imageio_ffmpeg import get_ffmpeg_exe
    FFMPEG_EXE = get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = 'ffmpeg'

# ==============================================================================
# Utility: video + audio helpers
# ==============================================================================

def get_video_length(video_path):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / max(fps, 1e-6)
    cap.release()
    return duration, frame_count, fps


def extract_audio_to_wav(video_path: str, wav_path: str) -> bool:
    """Extracts audio as mono WAV (22.05k) for robust beat/onset analysis."""
    try:
        cmd = [
            FFMPEG_EXE, '-i', video_path,
            '-ac', '1', '-ar', '22050', '-vn', wav_path, '-y'
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return os.path.exists(wav_path)
    except Exception as e:
        print(f"  ⚠️  Could not extract audio: {e}")
        return False


def compute_beats_and_onsets(audio_wav: str) -> Dict[str, np.ndarray]:
    """Return beat times and onset envelope peaks (seconds). Requires librosa."""
    if not LIBROSA_AVAILABLE:
        return {"beats": np.array([]), "onsets": np.array([])}
    try:
        y, sr = librosa.load(audio_wav, sr=None, mono=True)
        # Onsets
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units='time')
        # Beats
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
        return {"beats": np.asarray(beats), "onsets": np.asarray(onsets)}
    except Exception as e:
        print(f"  ⚠️  Beat/onset analysis failed: {e}")
        return {"beats": np.array([]), "onsets": np.array([])}


# ==============================================================================
# Pose + geometry (your original structures, kept and expanded)
# ==============================================================================

POSE_LANDMARK_INDEX = {
    "nose": 0,
    "left_eye_inner": 1,
    "left_eye": 2,
    "left_eye_outer": 3,
    "right_eye_inner": 4,
    "right_eye": 5,
    "right_eye_outer": 6,
    "left_ear": 7,
    "right_ear": 8,
    "mouth_left": 9,
    "mouth_right": 10,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_pinky": 17,
    "right_pinky": 18,
    "left_index": 19,
    "right_index": 20,
    "left_thumb": 21,
    "right_thumb": 22,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
    "left_heel": 29,
    "right_heel": 30,
    "left_foot_index": 31,
    "right_foot_index": 32,
}

# joints: (parent, joint, child)
ANGLE_TRIPLETS = [
    (11, 13, 15),  # left shoulder - left elbow - left wrist
    (12, 14, 16),  # right shoulder - right elbow - right wrist
    (23, 25, 27),  # left hip - left knee - left ankle
    (24, 26, 28),  # right hip - right knee - right ankle
    (11, 23, 25),  # left shoulder - left hip - left knee
    (12, 24, 26),  # right shoulder - right hip - right knee
]

CORE_LANDMARKS = np.array([
    POSE_LANDMARK_INDEX["nose"],
    POSE_LANDMARK_INDEX["left_eye_outer"],
    POSE_LANDMARK_INDEX["right_eye_outer"],
    POSE_LANDMARK_INDEX["left_ear"],
    POSE_LANDMARK_INDEX["right_ear"],
    POSE_LANDMARK_INDEX["left_shoulder"],
    POSE_LANDMARK_INDEX["right_shoulder"],
    POSE_LANDMARK_INDEX["left_elbow"],
    POSE_LANDMARK_INDEX["right_elbow"],
    POSE_LANDMARK_INDEX["left_wrist"],
    POSE_LANDMARK_INDEX["right_wrist"],
    POSE_LANDMARK_INDEX["left_hip"],
    POSE_LANDMARK_INDEX["right_hip"],
    POSE_LANDMARK_INDEX["left_knee"],
    POSE_LANDMARK_INDEX["right_knee"],
    POSE_LANDMARK_INDEX["left_ankle"],
    POSE_LANDMARK_INDEX["right_ankle"],
], dtype=np.int32)

POSE_EMBEDDING_PAIRS = [
    # Torso + orientation
    ("left_shoulder", "right_shoulder", 1.0),
    ("left_hip", "right_hip", 1.0),
    ("left_shoulder", "left_hip", 0.9),
    ("right_shoulder", "right_hip", 0.9),
    ("left_shoulder", "right_hip", 0.9),
    ("right_shoulder", "left_hip", 0.9),
    # Upper limbs
    ("left_shoulder", "left_elbow", 1.2),
    ("left_elbow", "left_wrist", 1.4),
    ("right_shoulder", "right_elbow", 1.2),
    ("right_elbow", "right_wrist", 1.4),
    ("left_wrist", "right_wrist", 0.8),
    # Lower limbs
    ("left_hip", "left_knee", 1.2),
    ("left_knee", "left_ankle", 1.4),
    ("right_hip", "right_knee", 1.2),
    ("right_knee", "right_ankle", 1.4),
    ("left_ankle", "right_ankle", 0.8),
    ("left_knee", "right_knee", 0.8),
    # Head + torso alignment
    ("nose", "left_shoulder", 1.6),
    ("nose", "right_shoulder", 1.6),
    ("nose", "left_hip", 1.4),
    ("nose", "right_hip", 1.4),
    ("left_ear", "left_shoulder", 1.5),
    ("right_ear", "right_shoulder", 1.5),
    ("left_eye_outer", "right_eye_outer", 1.5),
    ("left_eye_outer", "left_shoulder", 1.4),
    ("right_eye_outer", "right_shoulder", 1.4),
    # Feet orientation for balance
    ("left_ankle", "left_foot_index", 1.1),
    ("right_ankle", "right_foot_index", 1.1),
    ("left_heel", "left_foot_index", 0.9),
    ("right_heel", "right_foot_index", 0.9),
]

EMBEDDING_VECTOR_SIZE = len(POSE_EMBEDDING_PAIRS) * 3

# ==============================================================================
# Geometry helpers
# ==============================================================================

def _angle_3pts(a, b, c):
    ba = a - b
    bc = c - b
    ba_n = np.linalg.norm(ba)
    bc_n = np.linalg.norm(bc)
    if ba_n < 1e-6 or bc_n < 1e-6:
        return None
    cosang = np.dot(ba, bc) / (ba_n * bc_n)
    cosang = np.clip(cosang, -1.0, 1.0)
    return np.degrees(np.arccos(cosang))


def pose_to_angles(landmarks_np):
    angles = []
    for (i, j, k) in ANGLE_TRIPLETS:
        a = landmarks_np[i]
        b = landmarks_np[j]
        c = landmarks_np[k]
        ang = _angle_3pts(a, b, c)
        angles.append(ang)
    return angles


def normalize_pose(keypoints):
    landmarks = keypoints.reshape(33, 3)
    left_hip = landmarks[23]
    right_hip = landmarks[24]
    hip_center = (left_hip + right_hip) / 2
    landmarks_centered = landmarks - hip_center

    left_shoulder = landmarks[11]
    right_shoulder = landmarks[12]
    shoulder_center = (left_shoulder + right_shoulder) / 2
    shoulder_width = np.linalg.norm(left_shoulder - right_shoulder)
    torso_height = np.linalg.norm(shoulder_center - hip_center)
    scale_factor = shoulder_width + torso_height

    if scale_factor > 0.01:
        landmarks_normalized = landmarks_centered / scale_factor
    else:
        landmarks_normalized = landmarks_centered
    return landmarks_normalized.flatten()


def _get_pose_center(landmarks: np.ndarray) -> np.ndarray:
    left_hip = landmarks[POSE_LANDMARK_INDEX["left_hip"]]
    right_hip = landmarks[POSE_LANDMARK_INDEX["right_hip"]]
    left_shoulder = landmarks[POSE_LANDMARK_INDEX["left_shoulder"]]
    right_shoulder = landmarks[POSE_LANDMARK_INDEX["right_shoulder"]]
    if np.linalg.norm(left_hip) > 1e-5 and np.linalg.norm(right_hip) > 1e-5:
        return (left_hip + right_hip) * 0.5
    return np.mean(np.stack([left_hip, right_hip, left_shoulder, right_shoulder]), axis=0)


def _get_pose_size(landmarks: np.ndarray, pose_center: np.ndarray) -> float:
    left_shoulder = landmarks[POSE_LANDMARK_INDEX["left_shoulder"]]
    right_shoulder = landmarks[POSE_LANDMARK_INDEX["right_shoulder"]]
    left_hip = landmarks[POSE_LANDMARK_INDEX["left_hip"]]
    right_hip = landmarks[POSE_LANDMARK_INDEX["right_hip"]]
    torso_size = np.linalg.norm(((left_shoulder + right_shoulder) * 0.5) - ((left_hip + right_hip) * 0.5))
    max_distance = np.max(np.linalg.norm(landmarks - pose_center, axis=1))
    pose_size = max(torso_size * 2.5, max_distance)
    return max(pose_size, 1e-4)


def compute_pose_embedding(landmarks: np.ndarray) -> np.ndarray:
    pose_center = _get_pose_center(landmarks)
    pose_size = _get_pose_size(landmarks, pose_center)
    normalized = (landmarks - pose_center) / pose_size

    embedding_vectors = []
    for part_a, part_b, weight in POSE_EMBEDDING_PAIRS:
        idx_a = POSE_LANDMARK_INDEX[part_a]
        idx_b = POSE_LANDMARK_INDEX[part_b]
        vector = (normalized[idx_a] - normalized[idx_b]) * weight
        embedding_vectors.append(vector)

    if not embedding_vectors:
        return np.zeros(EMBEDDING_VECTOR_SIZE, dtype=np.float32)
    return np.concatenate(embedding_vectors).astype(np.float32)


# ==============================================================================
# Sequence utilities
# ==============================================================================

def _ensure_embeddings(seq: Sequence[np.ndarray], embeddings: Optional[Sequence[np.ndarray]]) -> np.ndarray:
    if embeddings is not None and len(embeddings) == len(seq):
        return np.asarray(embeddings, dtype=np.float32)
    fallback_embeddings: List[np.ndarray] = []
    for keypoints in seq:
        if keypoints is None or not np.any(keypoints):
            fallback_embeddings.append(np.zeros(EMBEDDING_VECTOR_SIZE, dtype=np.float32))
        else:
            fallback_embeddings.append(compute_pose_embedding(keypoints.reshape(33, 3)))
    return np.asarray(fallback_embeddings, dtype=np.float32)


def _ensure_visibility(length: int, visibility: Optional[Sequence[np.ndarray]]) -> np.ndarray:
    if visibility is not None and len(visibility) == length:
        return np.asarray(visibility, dtype=np.float32)
    return np.zeros((length, len(POSE_LANDMARK_INDEX)), dtype=np.float32)


def _motion_sequence(seq: Sequence[np.ndarray]) -> np.ndarray:
    motions = [0.0]
    for i in range(1, len(seq)):
        a = seq[i]
        b = seq[i - 1]
        if a is None or b is None:
            motions.append(0.0)
        else:
            motions.append(float(np.linalg.norm(a - b)))
    return np.asarray(motions, dtype=np.float32)


def _trimmed_mean(values: Sequence[float], trim_ratio: float = 0.1) -> float:
    if not values:
        return 0.0
    arr = np.sort(np.asarray(values, dtype=np.float32))
    k = int(len(arr) * trim_ratio)
    if len(arr) - 2 * k <= 0:
        return float(np.mean(arr))
    trimmed = arr[k : len(arr) - k]
    return float(np.mean(trimmed))


def _angle_distance(ref_angles, user_angles, user_has_pose: bool) -> float:
    """Normalized angle distance per frame pair for DTW cost (lower = better match).
    Normalisation denominator: 40° — joints off by 40° max out the penalty."""
    diffs = []
    for ra, ua in zip(ref_angles, user_angles):
        if ra is None:
            continue
        if (ua is None) or (not user_has_pose):
            diffs.append(1.0)
        else:
            diffs.append(min(1.0, abs(ra - ua) / 40.0))
    if not diffs:
        return 0.0
    return float(np.mean(diffs))


def _angle_similarity(ref_angles, user_angles, user_has_pose: bool) -> float:
    """Angle similarity per frame pair (higher = better match).
    Normalisation denominator: 40° — joints off by ≥40° score 0."""
    sims = []
    for ra, ua in zip(ref_angles, user_angles):
        if ra is None:
            continue
        if (ua is None) or (not user_has_pose):
            sims.append(0.0)
        else:
            sims.append(max(0.0, 1.0 - abs(ra - ua) / 40.0))
    if not sims:
        return 0.0  # No valid comparisons → no credit
    return float(np.mean(sims))


def _visibility_similarity(visibility: np.ndarray) -> float:
    if visibility is None or visibility.size == 0:
        return 0.0
    head_score = np.mean(visibility[CORE_LANDMARKS[:5]])
    limb_score = np.mean(visibility[CORE_LANDMARKS[5:]])
    raw = 0.55 * head_score + 0.45 * limb_score
    return float(np.clip((raw - 0.25) / 0.5, 0.0, 1.0))


# ==============================================================================
# DTW (kept, with small refinements)
# ==============================================================================

def _dtw_path(embeddings_a: np.ndarray, embeddings_b: np.ndarray, cost_fn: Callable[[int, int], float], window: Optional[int] = None) -> Tuple[float, List[Tuple[int, int]]]:
    len_a = len(embeddings_a)
    len_b = len(embeddings_b)
    if len_a == 0 or len_b == 0:
        return float("inf"), []

    if FASTDTW_AVAILABLE and window is None:
        distance, path = fastdtw(range(len_a), range(len_b), dist=lambda i, j: cost_fn(i, j))
        return float(distance), list(path)

    if window is None:
        window = max(abs(len_a - len_b) + 6, 12)
    else:
        window = max(window, abs(len_a - len_b))

    dtw = np.full((len_a + 1, len_b + 1), np.inf, dtype=np.float32)
    dtw[0, 0] = 0.0

    for i in range(1, len_a + 1):
        j_start = max(1, i - window)
        j_end = min(len_b, i + window)
        for j in range(j_start, j_end + 1):
            cost = cost_fn(i - 1, j - 1)
            dtw[i, j] = cost + min(
                dtw[i - 1, j],
                dtw[i, j - 1],
                dtw[i - 1, j - 1],
            )

    i, j = len_a, len_b
    path: List[Tuple[int, int]] = []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        options = [
            (dtw[i - 1, j - 1], i - 1, j - 1),
            (dtw[i - 1, j], i - 1, j),
            (dtw[i, j - 1], i, j - 1),
        ]
        _, i, j = min(options, key=lambda x: x[0])

    path.reverse()
    return float(dtw[len_a, len_b]), path


# ==============================================================================
# Frame-level cost & similarity  (unchanged logic with small polish)
# ==============================================================================

def _frame_cost(idx_a: int, idx_b: int,
                embeddings_a: np.ndarray, embeddings_b: np.ndarray,
                angles_a, angles_b,
                valid_a, valid_b,
                visibility_a: np.ndarray, visibility_b: np.ndarray,
                motion_a: np.ndarray, motion_b: np.ndarray) -> float:
    # Ensure indices are integers and within bounds
    idx_a = int(idx_a)
    idx_b = int(idx_b)
    
    # Bounds checking
    if idx_a < 0 or idx_a >= len(embeddings_a) or idx_b < 0 or idx_b >= len(embeddings_b):
        return 999.0  # High cost for invalid indices
    
    embed_dist = float(np.linalg.norm(embeddings_a[idx_a] - embeddings_b[idx_b]))
    # Check bounds for angles and valid arrays
    if idx_a < len(angles_a) and idx_b < len(angles_b) and idx_b < len(valid_b):
        angle_penalty = _angle_distance(angles_a[idx_a], angles_b[idx_b], valid_b[idx_b])
    else:
        angle_penalty = 1.0  # High penalty for invalid indices

    visibility_penalty = 0.0
    if visibility_b.size and idx_b < len(visibility_b):
        vis_b = visibility_b[idx_b]
        head_visibility = np.mean(vis_b[CORE_LANDMARKS[:5]])
        body_visibility = np.mean(vis_b[CORE_LANDMARKS[5:]])
        visibility_penalty = max(0.0, 0.4 - (0.55 * head_visibility + 0.45 * body_visibility)) * 2.0

    motion_penalty = 0.0
    # Check bounds for motion arrays
    if idx_a < len(motion_a) and idx_b < len(motion_b):
        ref_motion = motion_a[idx_a]
        user_motion = motion_b[idx_b]
        if ref_motion > 0.015:
            ratio = user_motion / (ref_motion + 1e-6)
            if ratio < 0.12:
                motion_penalty = 2.2
            elif ratio < 0.25:
                motion_penalty = 1.2
            elif ratio < 0.45:
                motion_penalty = 0.6
            elif ratio > 2.0:
                motion_penalty = 0.4

    miss_penalty = 0.0
    if idx_b < len(valid_b) and not valid_b[idx_b]:
        miss_penalty += 1.8
    if idx_a < len(valid_a) and not valid_a[idx_a]:
        miss_penalty += 0.4

    return embed_dist + 0.9 * angle_penalty + visibility_penalty + motion_penalty + miss_penalty


def _frame_similarity(idx_a: int, idx_b: int,
                      embeddings_a: np.ndarray, embeddings_b: np.ndarray,
                      angles_a, angles_b,
                      valid_a, valid_b,
                      visibility_a: np.ndarray, visibility_b: np.ndarray,
                      motion_a: np.ndarray, motion_b: np.ndarray) -> float:
    """
    Improved frame similarity calculation with better accuracy.
    Uses weighted combination of multiple features for more accurate scoring.
    """
    # Ensure indices are integers and within bounds
    idx_a = int(idx_a)
    idx_b = int(idx_b)
    
    # Bounds checking
    if idx_a < 0 or idx_a >= len(embeddings_a) or idx_b < 0 or idx_b >= len(embeddings_b):
        return 0.0  # Low similarity for invalid indices
    
    # 1. Embedding similarity (pose structure) — primary signal
    #    Decay coefficient 2.0: at dist=0.5 → 0.37 (good match),
    #    at dist=1.2 → 0.09 (clearly different), at dist=2.0 → 0.018 (nothing alike).
    embed_dist = float(np.linalg.norm(embeddings_a[idx_a] - embeddings_b[idx_b]))
    embed_similarity = float(np.exp(-2.0 * embed_dist))

    # 2. Angle similarity (joint angles) — normalised over 40°
    angle_similarity = 0.0
    if idx_a < len(angles_a) and idx_b < len(angles_b) and idx_b < len(valid_b):
        angle_similarity = _angle_similarity(angles_a[idx_a], angles_b[idx_b], valid_b[idx_b])

    # 3. Motion consistency (per-frame ratio)
    motion_similarity = 1.0
    if idx_a < len(motion_a) and idx_b < len(motion_b):
        ref_motion = motion_a[idx_a]
        user_motion = motion_b[idx_b]
        if ref_motion > 0.02:
            ratio = user_motion / (ref_motion + 1e-6)
            if 0.5 <= ratio <= 1.5:
                motion_similarity = 1.0
            elif 0.3 <= ratio < 0.5 or 1.5 < ratio <= 2.0:
                motion_similarity = 0.80
            elif 0.15 <= ratio < 0.3 or 2.0 < ratio <= 2.5:
                motion_similarity = 0.50
            else:
                motion_similarity = 0.20

    # Weighted combination — visibility removed from positive side (only used as penalty below)
    # Embed: 65%, Angle: 30%, Motion: 5%
    base_similarity = (
        0.65 * embed_similarity +
        0.30 * angle_similarity +
        0.05 * motion_similarity
    )

    # Penalty for failed pose detection
    if idx_b < len(valid_b) and not valid_b[idx_b]:
        base_similarity *= 0.10  # Strong penalty: user pose not detected
    elif idx_a < len(valid_a) and not valid_a[idx_a]:
        base_similarity *= 0.40  # Moderate penalty: reference pose not detected

    return float(np.clip(base_similarity, 0.0, 1.0))


# ==============================================================================
# Pose extraction (kept your structure, minor tweaks)
# ==============================================================================

def extract_pose_keypoints(video_path, store_frames=True, frame_skip=1):
    """
    Extract pose keypoints from video.
    
    Args:
        video_path: Path to video file
        store_frames: Whether to store frame images (uses more memory)
        frame_skip: Process every Nth frame (1 = all frames, 2 = every 2nd, etc.)
    
    Returns:
        Tuple of (keypoints_seq, frames, angles_seq, valid_mask, embeddings_seq, visibility_seq)
    """
    # Get video info to determine if we need downsampling / frame skipping
    cap_info = cv2.VideoCapture(video_path)
    fps = cap_info.get(cv2.CAP_PROP_FPS) or 15.0
    frame_count = int(cap_info.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / max(fps, 1e-6)
    cap_info.release()
    
    # Auto-adjust frame_skip for long videos to speed up processing
    if frame_skip == 1:
        if duration > 60:
            frame_skip = 4
            print(f"  ⚠️  Video is {duration:.1f}s long, processing every {frame_skip}th frame to speed up analysis")
        elif duration > 30:
            frame_skip = 3
            print(f"  ⚠️  Video is {duration:.1f}s long, processing every {frame_skip}rd frame to speed up analysis")
        elif duration > 10:
            frame_skip = 2
            print(f"  ⚠️  Video is {duration:.1f}s long, processing every {frame_skip}nd frame to speed up analysis")

    # Preferred path: use MediaPipe Pose for real 2D keypoints
    if MEDIAPIPE_AVAILABLE and mp_pose is not None:
        print("  Using MediaPipe Pose for keypoint extraction")
        cap = cv2.VideoCapture(video_path)
        keypoints_seq = []
        angles_seq = []
        valid_mask = []
        embeddings_seq = []
        visibility_seq = []
        frames = []
        frame_idx = 0

        with mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_skip != 0:
                    frame_idx += 1
                    continue

                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(image_rgb)

                if results.pose_landmarks:
                    landmarks_np = np.zeros((33, 3), dtype=np.float32)
                    visibility = np.zeros(len(POSE_LANDMARK_INDEX), dtype=np.float32)
                    for i, lm in enumerate(results.pose_landmarks.landmark):
                        if i >= landmarks_np.shape[0]:
                            break
                        landmarks_np[i, 0] = lm.x
                        landmarks_np[i, 1] = lm.y
                        landmarks_np[i, 2] = lm.z
                        visibility[i] = lm.visibility

                    flat = landmarks_np.flatten()
                    keypoints_seq.append(flat)
                    angles_seq.append(pose_to_angles(landmarks_np))
                    valid_mask.append(True)
                    embeddings_seq.append(compute_pose_embedding(landmarks_np))
                    visibility_seq.append(visibility)
                else:
                    keypoints_seq.append(np.zeros(33 * 3, dtype=np.float32))
                    angles_seq.append([None] * len(ANGLE_TRIPLETS))
                    valid_mask.append(False)
                    visibility_seq.append(np.zeros(len(POSE_LANDMARK_INDEX), dtype=np.float32))

                if store_frames:
                    frames.append(frame)

                frame_idx += 1

        cap.release()

        if not keypoints_seq:
            return (np.array([]), [], [], [], np.array([]), np.array([]))

        return (
            np.asarray(keypoints_seq, dtype=np.float32),
            frames,
            angles_seq,
            valid_mask,
            np.asarray(embeddings_seq, dtype=np.float32) if embeddings_seq else np.array([]),
            np.asarray(visibility_seq, dtype=np.float32) if visibility_seq else np.array([]),
        )

    # If MediaPipe is not available, treat this as a hard error instead of
    # silently falling back to optical flow. The whole scoring + critique
    # pipeline assumes pose-based keypoints/angles now.
    raise RuntimeError(
        "MediaPipe Pose is not available in this environment. "
        "Install mediapipe in the backend environment or adjust the pipeline."
    )


# ==============================================================================
# Simple DTW-based scoring (user's simplified approach)
# ==============================================================================

def extract_motion_features_simple(video_path, store_frames=False):
    """
    Extract motion features using OpenCV optical flow (no MediaPipe required).
    This is a simpler alternative that works without MediaPipe.
    
    Args:
        video_path: Path to video file
        store_frames: Whether to store frame images (uses more memory)
    
    Returns:
        Tuple of (motion_seq as numpy array, frames list)
    """
    # Debug logging removed - use DEBUG environment variable if needed
    
    cap = cv2.VideoCapture(video_path)
    motion_seq = []
    frames = []
    
    ret, prev_frame = cap.read()
    if not ret:
        cap.release()
        return np.array([]), []
    
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    # Resize to reduce computation (faster processing)
    # First resize to 320x240 for optical flow calculation
    prev_gray_flow = cv2.resize(prev_gray, (320, 240))
    if store_frames:
        frames.append(prev_frame)
    
    # First frame has no motion - downsample magnitude hard to 40x30 (64× smaller)
    motion_seq.append(np.zeros(40 * 30, dtype=np.float32))  # Downsampled flow magnitude
    
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_flow = cv2.resize(gray, (320, 240))
        
        # Calculate optical flow on 320x240
        flow = cv2.calcOpticalFlowFarneback(prev_gray_flow, gray_flow, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        
        # Calculate magnitude of movement (motion vector)
        magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
        # CRITICAL OPTIMIZATION: Downsample magnitude hard to 40×30 (64× smaller than 320×240)
        # This reduces per-frame vector from 76,800 to 1,200 elements - massive speedup
        magnitude_downsampled = cv2.resize(magnitude, (40, 30), interpolation=cv2.INTER_AREA)
        # Flatten to 1D array for DTW comparison
        motion_vector = magnitude_downsampled.flatten().astype(np.float32)
        # Debug log feature vector shape (only if DEBUG_MODE enabled)
        if frame_count == 1:  # Only log once per video
            import os
            if os.getenv("DEBUG", "false").lower() == "true":
                print(f"[DEBUG] feature_vector.shape={motion_vector.shape}")
        motion_seq.append(motion_vector)
        
        prev_gray_flow = gray_flow
        
        if store_frames:
            frames.append(frame)
        prev_gray = gray
        
        # Debug logging removed - use DEBUG environment variable if needed
    
    cap.release()
    
    # Debug logging removed - use DEBUG environment variable if needed
    
    return np.array(motion_seq), frames


def compute_similarity_score_simple(seq1, seq2):
    """
    Compute similarity score (0-100) based on DTW alignment.
    Works with both pose keypoints and motion features.
    
    Args:
        seq1: Reference sequence (numpy array)
        seq2: User sequence (numpy array)
    
    Returns:
        Score from 0-100
    """
    if not FASTDTW_AVAILABLE:
        raise RuntimeError("fastdtw is required for DTW alignment. Install with: pip install fastdtw")
    
    if len(seq1) == 0 or len(seq2) == 0:
        return 0.0
    
    # For motion features (large arrays), use mean of motion per frame for faster DTW
    # For pose keypoints (small arrays), use full vectors
    if len(seq1[0]) > 1000:  # Motion features (flattened images)
        # Use mean motion per frame for faster comparison
        seq1_mean = np.array([np.mean(frame) for frame in seq1])
        seq2_mean = np.array([np.mean(frame) for frame in seq2])
        seq1_std = np.array([np.std(frame) for frame in seq1])
        seq2_std = np.array([np.std(frame) for frame in seq2])
        # Combine mean and std for better comparison
        seq1_features = np.column_stack([seq1_mean, seq1_std])
        seq2_features = np.column_stack([seq2_mean, seq2_std])
        use_features = True
    else:
        # Pose keypoints - use directly
        seq1_features = seq1
        seq2_features = seq2
        use_features = False
    
    # Align sequences using DTW
    distance, path = fastdtw(seq1_features, seq2_features, dist=euclidean)
    
    # Compute similarity score based on normalized DTW distances
    distances = []
    for i, j in path:
        if i < len(seq1_features) and j < len(seq2_features):
            d = euclidean(seq1_features[i], seq2_features[j])
            distances.append(d)

    if not distances:
        return 0.0

    mean_dist = np.mean(distances)
    
    # Adjust normalization based on feature type
    if use_features:
        # Motion features - different scale
        score = np.clip(100 * np.exp(-mean_dist * 2), 0, 100)
    else:
        # Pose keypoints - original formula
        score = np.clip(100 * np.exp(-mean_dist * 10), 0, 100)
    
    return round(float(score), 1)


# ==============================================================================
# New: Metrics layer (timing, energy, sharpness, bounce) + critiques
# ==============================================================================

def _pelvis_vertical(landmarks33: np.ndarray) -> float:
    lhip = landmarks33[POSE_LANDMARK_INDEX['left_hip']]
    rhip = landmarks33[POSE_LANDMARK_INDEX['right_hip']]
    pelvis = 0.5 * (lhip + rhip)
    return float(pelvis[1])  # y in normalized image coords


def _head_xy(landmarks33: np.ndarray) -> np.ndarray:
    return landmarks33[POSE_LANDMARK_INDEX['nose'], :2]


def _seq_from_keypoints(seq: Sequence[np.ndarray]) -> np.ndarray:
    # back to (N, 33, 3) from normalized flat
    out = []
    for s in seq:
        if s is None or not np.any(s):
            out.append(np.zeros((33,3), dtype=np.float32))
        else:
            out.append(s.reshape(33,3))
    return np.asarray(out)


def _finite_diff(x: np.ndarray) -> np.ndarray:
    if len(x) < 2:
        return np.zeros_like(x)
    dx = np.diff(x, axis=0, prepend=x[[0]])
    return dx


def compute_motion_features(seq_norm: Sequence[np.ndarray], angles_seq, fps: float) -> Dict[str, np.ndarray]:
    """Return per-frame energy, sharpness, bounce, and angle deltas (pairwise).
    energy ~ mean joint velocity; sharpness ~ jerk peaks; bounce ~ pelvis vertical RMS.
    """
    M = _seq_from_keypoints(seq_norm)  # (T,33,3)
    # velocity & acceleration norms (x,y only for stability)
    vel = np.linalg.norm(_finite_diff(M[...,:2]) * fps, axis=2)  # (T,33)
    acc = np.linalg.norm(_finite_diff(vel) * fps, axis=1)       # (T,)
    jerk = np.abs(_finite_diff(acc) * fps)                      # (T,)

    energy = np.mean(vel, axis=1)                               # (T,)

    # bounce from pelvis vertical oscillation (use raw y trajectory on norm pose)
    pelvis_y = np.array([_pelvis_vertical(m) for m in M])
    # high-pass via diff to remove drift
    bounce = np.abs(_finite_diff(pelvis_y) * fps)

    head_xy = np.array([_head_xy(m) for m in M])
    head_jitter = np.linalg.norm(_finite_diff(head_xy) * fps, axis=1)

    # angle velocity magnitude as additional motion reference
    ang = np.array([[0.0 if a is None else a for a in fr] for fr in angles_seq], dtype=np.float32)
    ang_vel = np.linalg.norm(_finite_diff(ang) * fps, axis=1)   # (T,)

    return {
        'energy': energy.astype(np.float32),
        'sharpness': jerk.astype(np.float32),
        'bounce': bounce.astype(np.float32),
        'angle_speed': ang_vel.astype(np.float32),
        'pelvis_y': pelvis_y.astype(np.float32),
        'head_jitter': head_jitter.astype(np.float32),
    }


def _per_joint_angle_deltas(angles_a, angles_b) -> List[Optional[float]]:
    deltas = []
    for ra, ua in zip(angles_a, angles_b):
        if (ra is None) or (ua is None):
            deltas.append(None)
        else:
            deltas.append(abs(ra - ua))
    return deltas


ANGLE_NAME_META = {
    "left elbow": ("arms", "left", "elbow"),
    "right elbow": ("arms", "right", "elbow"),
    "left knee": ("legs", "left", "knee"),
    "right knee": ("legs", "right", "knee"),
    "left hip line": ("levels", "left", "hip_line"),
    "right hip line": ("levels", "right", "hip_line"),
}


def _dedupe_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if not item:
            continue
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _classify_performance_mode(avg_similarity: float,
                               energy_ratio: float,
                               avg_energy_user: float,
                               avg_energy_ref: float,
                               path_len: int,
                               motion_ratios: List[float]) -> str:
    """
    Rough heuristics to describe how the user approached the run.
    Thresholds are intentionally generous so they are easy to tune later.
    """
    tiny_energy = avg_energy_user < 0.02 and energy_ratio < 0.1
    if tiny_energy:
        return "still"

    if 0.1 <= energy_ratio < 0.4:
        return "marking"

    similarity_ok = avg_similarity >= 0.45
    energy_ok = 0.4 <= energy_ratio <= 1.6

    sufficient_frames = path_len >= 30
    motion_level = float(np.mean(motion_ratios)) if motion_ratios else 0.0
    looks_random = energy_ratio >= 0.4 and avg_similarity < 0.35 and sufficient_frames and motion_level > 0.2
    if looks_random:
        return "random"

    if similarity_ok and energy_ok:
        return "on_choreo"

    # Fallback: treat as on-choreo so critiques stay detailed.
    return "on_choreo"


def generate_critiques(path: List[Tuple[int, int]],
                       angles_ref,
                       angles_user,
                       feats_ref: Dict[str, np.ndarray],
                       feats_user: Dict[str, np.ndarray],
                       fps_ref: float,
                       fps_user: float,
                       thresholds: Dict[str, float],
                       performance_mode: str = "on_choreo",
                       global_stats: Optional[Dict[str, float]] = None) -> List[Dict]:
    """Turn metrics into timestamped, human-style notes."""
    if not path:
        return []

    performance_mode = performance_mode or "on_choreo"
    global_stats = global_stats or {}

    if performance_mode == "still":
        return _build_still_events(path, fps_ref, fps_user, global_stats)

    sample_interval_seconds = 0.75
    max_ref_frame = max(ia for ia, _ in path) if path else 0
    max_ref_time = max_ref_frame / max(fps_ref, 1e-6)

    sampled_indices = set()
    current_time = 0.0
    while current_time <= max_ref_time:
        target_frame = int(current_time * fps_ref)
        if target_frame <= max_ref_frame:
            sampled_indices.add(target_frame)
        current_time += sample_interval_seconds
    if max_ref_frame > 0:
        sampled_indices.add(max_ref_frame)

    path_dict: Dict[int, List[Tuple[int, int, int]]] = {}
    for idx, (ia, ib) in enumerate(path):
        path_dict.setdefault(ia, []).append((idx, ia, ib))

    events: List[Dict] = []
    processed_times = set()
    random_windows_used = set()
    random_window_seconds = 4.0
    allow_micro_angles = performance_mode != "random"

    names = [
        "left elbow",
        "right elbow",
        "left knee",
        "right knee",
        "left hip line",
        "right hip line",
    ]
    pelvis_ref = feats_ref.get('pelvis_y')
    pelvis_user = feats_user.get('pelvis_y')
    head_ref = feats_ref.get('head_jitter')
    head_user = feats_user.get('head_jitter')

    def _flag_category(cat_list: List[str], cat: str, front: bool = False):
        if not cat:
            return
        if cat in cat_list:
            return
        if front:
            cat_list.insert(0, cat)
        else:
            cat_list.append(cat)

    for target_ref_frame in sorted(sampled_indices):
        best_match = None
        best_distance = float('inf')
        if target_ref_frame in path_dict:
            best_match = path_dict[target_ref_frame][0][1:]
        if best_match is None:
            for ia, ib in path:
                distance = abs(ia - target_ref_frame)
                if distance < best_distance:
                    best_distance = distance
                    best_match = (ia, ib)
        if best_match is None:
            continue

        ia, ib = best_match
        t_user = ib / max(fps_user, 1e-6)
        t_ref = ia / max(fps_ref, 1e-6)

        time_key = round(t_ref, 1)
        if time_key in processed_times:
            continue
        processed_times.add(time_key)

        timing_ms = 1000.0 * (ib / max(fps_user, 1e-6) - ia / max(fps_ref, 1e-6))
        deltas = _per_joint_angle_deltas(angles_ref[ia], angles_user[ib])

        e_ratio = feats_user['energy'][ib] / (feats_ref['energy'][ia] + 1e-6)
        s_ratio = feats_user['sharpness'][ib] / (feats_ref['sharpness'][ia] + 1e-6)
        b_ratio = feats_user['bounce'][ib] / (feats_ref['bounce'][ia] + 1e-6)

        technical_notes: List[str] = []
        coach_lines: List[str] = []
        category_candidates: List[str] = []

        if performance_mode == "random":
            _flag_category(category_candidates, "choreo_match", front=True)

        timing_phrase = ""
        if abs(timing_ms) > thresholds['timing_ms']:
            direction = "late" if timing_ms > 0 else "early"
            timing_phrase = f"You're {direction} by about {int(abs(timing_ms))} ms."
            _flag_category(category_candidates, "timing")
            technical_notes.append(f"timing_ms={int(round(timing_ms))}")

        technical_notes.append(f"energy_ratio={e_ratio:.2f}")
        if e_ratio < thresholds['energy_low']:
            if performance_mode == "marking":
                coach_lines.append("You're marking this section—go bigger with your arms and travel full out.")
            else:
                coach_lines.append("Put more energy into this phrase so the lines read.")
            _flag_category(category_candidates, "energy")
        elif e_ratio > 1.15 and allow_micro_angles:
            coach_lines.append("Great energy—now keep it cleaner so it doesn't look messy.")
            _flag_category(category_candidates, "cleanliness")

        technical_notes.append(f"sharpness_ratio={s_ratio:.2f}")
        if s_ratio < thresholds['sharp_low']:
            coach_lines.append("Make the hits crisper—tense up and stop each move sharply.")
            _flag_category(category_candidates, "sharpness")

        technical_notes.append(f"bounce_ratio={b_ratio:.2f}")
        if b_ratio < thresholds['bounce_low']:
            coach_lines.append("Sit into the groove more—add bounce through the knees and hips.")
            _flag_category(category_candidates, "bounce")

        if pelvis_ref is not None and pelvis_user is not None:
            if ia < len(pelvis_ref) and ib < len(pelvis_user):
                pelvis_delta = pelvis_user[ib] - pelvis_ref[ia]
                # positive delta => user lower (y grows downward)
                if pelvis_delta > 0.035:
                    coach_lines.append("Don't bend down so much—lift through your abs and project upward.")
                    _flag_category(category_candidates, "levels")
                elif pelvis_delta < -0.04:
                    coach_lines.append("Sit into this level more—drop your weight like the reference.")
                    _flag_category(category_candidates, "levels")

        if head_ref is not None and head_user is not None:
            if ia < len(head_ref) and ib < len(head_user):
                head_ratio = head_user[ib] / (head_ref[ia] + 1e-6)
                technical_notes.append(f"head_ratio={head_ratio:.2f}")
                if head_ratio > 1.6:
                    coach_lines.append("Try not to shake your head so much—keep it calmer so the focus is on the body.")
                    _flag_category(category_candidates, "head")

        arm_low, arm_high = set(), set()
        leg_low, leg_high = set(), set()
        hip_low = set()

        mismatch_count = sum(1 for d in deltas if d is not None and d > thresholds['angle_warn'])
        for idx, (name, d) in enumerate(zip(names, deltas)):
            if d is None:
                continue
            technical_notes.append(f"{name.replace(' ', '_')}~{round(float(d), 1)}°")
            if d <= thresholds['angle_warn'] or not allow_micro_angles:
                continue

            category, side, _ = ANGLE_NAME_META.get(name, ("cleanliness", "both", "angle"))
            ref_angle = angles_ref[ia][idx]
            user_angle = angles_user[ib][idx]
            direction = None
            if ref_angle is not None and user_angle is not None:
                if user_angle + 5 < ref_angle:
                    direction = "smaller"
                elif user_angle - 5 > ref_angle:
                    direction = "bigger"

            if category == "arms":
                (arm_low if direction == "smaller" else arm_high if direction == "bigger" else arm_low).add(side)
            elif category == "legs":
                (leg_low if direction == "smaller" else leg_high if direction == "bigger" else leg_low).add(side)
            elif category == "levels":
                hip_low.add(side)
            _flag_category(category_candidates, category)

        if allow_micro_angles:
            if arm_low:
                subject = "Both arms" if len(arm_low) > 1 else f"Your {next(iter(arm_low))} arm"
                coach_lines.append(f"{subject} are under the line—lift them closer to that 45° angle.")
            if arm_high:
                subject = "Both arms" if len(arm_high) > 1 else f"Your {next(iter(arm_high))} arm"
                coach_lines.append(f"{subject} are overshooting—lower them a bit to match the choreo.")
            if leg_low:
                subject = "Both legs" if len(leg_low) > 1 else f"Your {next(iter(leg_low))} leg"
                coach_lines.append(f"{subject} is more bent—stand taller so the level matches.")
            if leg_high:
                subject = "Both legs" if len(leg_high) > 1 else f"Your {next(iter(leg_high))} leg"
                coach_lines.append(f"{subject} is too straight—sit into the plié like the reference.")
            if hip_low:
                coach_lines.append("Don't bend down so much—keep the torso lifted and project up.")

            left_arm_delta = deltas[0] if len(deltas) > 0 else None
            right_arm_delta = deltas[1] if len(deltas) > 1 else None
            if (left_arm_delta and right_arm_delta and
                    abs(left_arm_delta - right_arm_delta) > 12):
                coach_lines.append("Wrong arm / wrong leg alert—match the same arm the choreo uses.")

            left_leg_delta = deltas[2] if len(deltas) > 2 else None
            right_leg_delta = deltas[3] if len(deltas) > 3 else None
            if (left_leg_delta and right_leg_delta and
                    abs(left_leg_delta - right_leg_delta) > 12):
                coach_lines.append("Check which leg initiates—one side is doing a totally different move.")

        summary_parts: List[str] = []
        if performance_mode == "random":
            window_key = int(t_ref // random_window_seconds)
            if window_key in random_windows_used or len(random_windows_used) >= 8:
                continue
            random_windows_used.add(window_key)
            window_start = window_key * random_window_seconds
            window_end = min(max_ref_time, window_start + random_window_seconds)
            summary_parts.append(
                f"This chunk (~{window_start:.0f}–{window_end:.0f}s) doesn't match the reference combo—it reads like freestyle."
            )
            if e_ratio < thresholds['energy_low']:
                summary_parts.append("Once the steps are locked, go full out so the shapes pop.")
            elif e_ratio > 1.2:
                summary_parts.append("You've got plenty of energy—channel it into the right directions.")
            if timing_phrase:
                summary_parts.append(timing_phrase)
        else:
            if timing_phrase:
                summary_parts.append(timing_phrase)
            summary_parts.extend(coach_lines)

        summary_parts = _dedupe_preserve_order(summary_parts)
        summary = " ".join(summary_parts).strip()
        if not summary:
            continue

        severity = 1
        if len(category_candidates) >= 2 or mismatch_count >= 3:
            severity = 2
        if len(category_candidates) >= 3 or mismatch_count >= 5 or abs(timing_ms) > thresholds['timing_ms'] * 1.6:
            severity = 3

        events.append({
            "t_user": round(t_user, 3),
            "t_ref": round(t_ref, 3),
            "timing_ms": int(round(timing_ms)),
            "category": category_candidates[0] if category_candidates else "overall",
            "severity": severity,
            "summary": summary,
            "notes": technical_notes,
            "angle_deltas_deg": [None if d is None else round(float(d), 1) for d in deltas],
        })

    events.sort(key=lambda e: e['t_ref'])

    if len(events) > 200:
        events_by_severity = sorted(
            events,
            key=lambda e: (-e.get('severity', 1), -len(e.get('notes', [])), -abs(e.get('timing_ms', 0))))
        top_events = events_by_severity[:150]
        remaining = events_by_severity[150:]
        if remaining:
            time_samples = np.linspace(0, max_ref_time, min(50, len(remaining)))
            for target_time in time_samples:
                closest = min(remaining, key=lambda e: abs(e['t_ref'] - target_time))
                if closest not in top_events:
                    top_events.append(closest)
                    remaining.remove(closest)
                    if len(top_events) >= 200:
                        break
        events = top_events[:200]
        events.sort(key=lambda e: e['t_ref'])

    return events


def _build_still_events(path: List[Tuple[int, int]],
                        fps_ref: float,
                        fps_user: float,
                        global_stats: Dict[str, float]) -> List[Dict]:
    """Provide high-level feedback when the dancer barely moves."""
    if not path:
        return []

    energy_ratio = float(global_stats.get("energy_ratio", 0.0))
    avg_energy_user = float(global_stats.get("avg_energy_user", 0.0))

    anchor_indices = [
        max(0, int(len(path) * 0.33) - 1),
        min(len(path) - 1, int(len(path) * 0.66)),
    ]
    anchors = [path[idx] for idx in sorted(set(anchor_indices))]
    messages = [
        "I couldn’t really see the choreo this run—you stayed almost completely still. Dance the routine full out so I can give real notes.",
        "The reference is going full-out, so standing still will always score low. Try moving with the music and matching the shapes next time.",
    ]

    events = []
    for (ia, ib), message in zip(anchors, messages):
        t_user = ib / max(fps_user, 1e-6)
        t_ref = ia / max(fps_ref, 1e-6)
        events.append({
            "t_user": round(t_user, 3),
            "t_ref": round(t_ref, 3),
            "timing_ms": 0,
            "category": "overall",
            "severity": 3,
            "summary": message,
            "notes": [
                f"mode=still",
                f"energy_ratio={energy_ratio:.3f}",
                f"avg_energy_user={avg_energy_user:.5f}",
            ],
            "angle_deltas_deg": [],
        })
    return events


# ==============================================================================
# Similarity + alignment + scoring (returns more artifacts)
# ==============================================================================

def align_and_score(seq1, seq2,
                    angles1, angles2,
                    valid1, valid2,
                    fps1: float, fps2: float,
                    embeddings1=None, embeddings2=None,
                    visibility1=None, visibility2=None) -> Dict:
    if len(seq1) == 0 or len(seq2) == 0:
        return {"score": 0.0, "path": []}

    embeddings1 = _ensure_embeddings(seq1, embeddings1)
    embeddings2 = _ensure_embeddings(seq2, embeddings2)
    visibility1 = _ensure_visibility(len(seq1), visibility1)
    visibility2 = _ensure_visibility(len(seq2), visibility2)

    len_ref = min(len(seq1), len(angles1), len(valid1), len(embeddings1), len(visibility1))
    len_user = min(len(seq2), len(angles2), len(valid2), len(embeddings2), len(visibility2))

    seq1 = seq1[:len_ref]; seq2 = seq2[:len_user]
    angles1 = angles1[:len_ref]; angles2 = angles2[:len_user]
    valid1 = valid1[:len_ref]; valid2 = valid2[:len_user]
    embeddings1 = embeddings1[:len_ref]; embeddings2 = embeddings2[:len_user]
    visibility1 = visibility1[:len_ref]; visibility2 = visibility2[:len_user]

    motion_ref = _motion_sequence(seq1)
    motion_user = _motion_sequence(seq2)

    cost_fn = lambda i, j: _frame_cost(i, j, embeddings1, embeddings2, angles1, angles2,
                                       valid1, valid2, visibility1, visibility2, motion_ref, motion_user)

    # Time DTW alignment
    import time
    import os
    dtw_start = time.time()
    _, path = _dtw_path(embeddings1, embeddings2, cost_fn)
    dtw_time = time.time() - dtw_start
    if os.getenv("DEBUG", "false").lower() == "true":
        print(f"[DEBUG] dtw_time={dtw_time:.3f}s")
    if not path:
        return {"score": 0.0, "path": []}

    frame_scores: List[float] = []
    motion_ratios: List[float] = []

    for idx_a, idx_b in path:
        # Ensure indices are integers and within bounds
        idx_a = int(idx_a)
        idx_b = int(idx_b)
        
        # Bounds checking
        if idx_a < 0 or idx_a >= len(motion_ref) or idx_b < 0 or idx_b >= len(motion_user):
            continue
        
        frame_scores.append(_frame_similarity(idx_a, idx_b, embeddings1, embeddings2,
                                              angles1, angles2, valid1, valid2,
                                              visibility1, visibility2,
                                              motion_ref, motion_user))
        ref_motion = motion_ref[idx_a]
        user_motion = motion_user[idx_b]
        if ref_motion > 0.02:
            motion_ratios.append(float(np.clip(user_motion / (ref_motion + 1e-6), 0.0, 2.5)))

    # Base score: trimmed mean of per-frame similarities × 100
    base_score = _trimmed_mean(frame_scores, trim_ratio=0.10) * 100.0

    # Global motion energy adjustment — harder floor than before
    # Someone who barely moves during an active routine gets a steep penalty
    motion_adjustment = 1.0
    if motion_ratios:
        avg_ratio = float(np.mean(motion_ratios))
        if avg_ratio < 0.10:
            motion_adjustment = 0.15   # Nearly still — almost no credit
        elif avg_ratio < 0.20:
            motion_adjustment = 0.30   # Very low energy
        elif avg_ratio < 0.35:
            motion_adjustment = 0.55   # Low energy
        elif avg_ratio < 0.50:
            motion_adjustment = 0.75   # Below average
        elif avg_ratio < 0.65:
            motion_adjustment = 0.88   # Slightly below
        elif avg_ratio < 0.85:
            motion_adjustment = 0.95   # Close to reference
        elif avg_ratio <= 1.15:
            motion_adjustment = 1.00   # Excellent energy match
        elif avg_ratio <= 1.5:
            motion_adjustment = 0.95   # Slightly over
        elif avg_ratio <= 2.0:
            motion_adjustment = 0.85   # Too high
        else:
            motion_adjustment = 0.75   # Overacting

    # Pose validity penalty: if too few user frames had a detected pose,
    # the similarity scores are unreliable — cap the contribution.
    user_valid_frac = sum(1 for v in valid2 if v) / max(len(valid2), 1)
    if user_valid_frac < 0.30:
        # Very poor detection: scale down hard
        base_score *= user_valid_frac * 2.0
    elif user_valid_frac < 0.60:
        # Below-average detection: partial penalty
        base_score *= 0.60 + 0.40 * (user_valid_frac / 0.60)

    # Consistency bonus (kept small — only meaningful if base quality is good)
    consistency_bonus = 1.0
    if len(frame_scores) > 10:
        score_std = float(np.std(frame_scores))
        if score_std < 0.15:
            consistency_bonus = 1.04
        elif score_std < 0.25:
            consistency_bonus = 1.01
        elif score_std > 0.45:
            consistency_bonus = 0.97

    final_score = base_score * motion_adjustment * consistency_bonus
    final_score = max(0.0, min(100.0, final_score))

    import logging as _log
    _log.getLogger(__name__).info(
        f"[scoring] base={base_score:.1f} motion_adj={motion_adjustment:.2f} "
        f"valid_frac={user_valid_frac:.2f} consistency={consistency_bonus:.3f} "
        f"final={final_score:.1f}"
    )

    # New: compute metrics for critique
    feats_ref = compute_motion_features(seq1, angles1, fps1)
    feats_user = compute_motion_features(seq2, angles2, fps2)

    avg_similarity = float(np.mean(frame_scores)) if frame_scores else 0.0
    avg_energy_ref = float(np.mean(feats_ref['energy'])) if len(feats_ref['energy']) else 0.0
    avg_energy_user = float(np.mean(feats_user['energy'])) if len(feats_user['energy']) else 0.0
    energy_ratio_global = avg_energy_user / (avg_energy_ref + 1e-6) if avg_energy_ref > 0 else 0.0
    avg_angle_speed_ref = float(np.mean(feats_ref['angle_speed'])) if len(feats_ref['angle_speed']) else 0.0
    avg_angle_speed_user = float(np.mean(feats_user['angle_speed'])) if len(feats_user['angle_speed']) else 0.0
    avg_angle_speed_ratio = avg_angle_speed_user / (avg_angle_speed_ref + 1e-6) if avg_angle_speed_ref > 0 else 0.0
    global_motion_ratio = float(np.mean(motion_ratios)) if motion_ratios else 0.0

    performance_mode = _classify_performance_mode(
        avg_similarity=avg_similarity,
        energy_ratio=energy_ratio_global,
        avg_energy_user=avg_energy_user,
        avg_energy_ref=avg_energy_ref,
        path_len=len(path),
        motion_ratios=motion_ratios,
    )

    global_stats = {
        "avg_similarity": avg_similarity,
        "energy_ratio": energy_ratio_global,
        "avg_energy_ref": avg_energy_ref,
        "avg_energy_user": avg_energy_user,
        "avg_angle_speed_ratio": avg_angle_speed_ratio,
        "avg_angle_speed_ref": avg_angle_speed_ref,
        "avg_angle_speed_user": avg_angle_speed_user,
        "avg_motion_ratio": global_motion_ratio,
    }

    thresholds = {
        'angle_warn': 12.0,      # degrees
        'timing_ms': 120.0,      # ms
        'energy_low': 0.7,       # ratio
        'sharp_low': 0.6,        # ratio
        'bounce_low': 0.7        # ratio
    }

    events = generate_critiques(
        path,
        angles1,
        angles2,
        feats_ref,
        feats_user,
        fps1,
        fps2,
        thresholds,
        performance_mode=performance_mode,
        global_stats=global_stats,
    )

    # Also provide per-frame timing curve (lead/lag) for overlay
    timing_curve = []
    for ia, ib in path:
        timing_curve.append(1000.0 * (ib / max(fps2,1e-6) - ia / max(fps1,1e-6)))

    return {
        "score": round(float(final_score), 1),
        "path": path,
        "events": events,
        "timing_ms_curve": timing_curve,
        "thresholds": thresholds,
        "performance_mode": performance_mode,
        "global_stats": global_stats,
    }


# ------------------------------------------------------------------------------
# Backwards-compatible wrapper for legacy API compatibility
# ------------------------------------------------------------------------------
def compute_similarity_score(
    seq_ref,
    seq_user,
    angles_ref,
    angles_user,
    valid_ref,
    valid_user,
    embeddings_ref=None,
    embeddings_user=None,
    visibility_ref=None,
    visibility_user=None,
    fps_ref: Optional[float] = None,
    fps_user: Optional[float] = None,
    return_details: bool = False,
) -> Union[float, Dict[str, object]]:
    """
    Backwards-compatible wrapper function.

    Parameters mirror the legacy signature but now funnel through align_and_score.
    fps_ref / fps_user default to 30 FPS when not provided (pose extraction does not
    expose fps). Set return_details=True to get the full dict returned by align_and_score.
    """

    if seq_ref is None or seq_user is None:
        empty = {"score": 0.0, "path": []}
        return empty if return_details else 0.0

    fps_ref = float(fps_ref) if fps_ref else 30.0
    fps_user = float(fps_user) if fps_user else 30.0

    seq_ref_clean = seq_ref
    seq_user_clean = seq_user
    angles_ref_clean = angles_ref if angles_ref is not None else []
    angles_user_clean = angles_user if angles_user is not None else []
    valid_ref_clean = valid_ref if valid_ref is not None else []
    valid_user_clean = valid_user if valid_user is not None else []

    result = align_and_score(
        seq_ref_clean,
        seq_user_clean,
        angles_ref_clean,
        angles_user_clean,
        valid_ref_clean,
        valid_user_clean,
        fps_ref,
        fps_user,
        embeddings_ref,
        embeddings_user,
        visibility_ref,
        visibility_user,
    )

    return result if return_details else result.get("score", 0.0)


# ==============================================================================
# Recording + side-by-side (kept your code, tiny cleanups)
# ==============================================================================

def record_webcam_with_countdown(output_path, duration, fps=30, reference_video_path=None):
    cap = cv2.VideoCapture(0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

    ref_cap = None
    ref_width = width
    ref_height = height
    if reference_video_path:
        ref_cap = cv2.VideoCapture(reference_video_path)
        ref_width = int(ref_cap.get(cv2.CAP_PROP_FRAME_WIDTH) or width)
        ref_height = int(ref_cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or height)

    display_height = 480
    display_width = int(width * display_height / max(height,1))
    ref_display_width = int(ref_width * display_height / max(ref_height,1))

    audio_started = False
    if reference_video_path and PYGAME_AVAILABLE:
        try:
            pygame.mixer.init()
            print("  Loading audio from reference video...")
        except Exception as e:
            print(f"  Warning: Could not initialize audio: {e}")

    print("\nGet ready to dance!")
    for i in range(5, 0, -1):
        ret, frame = cap.read()
        if ret:
            webcam_resized = cv2.resize(frame, (display_width, display_height))
            cv2.putText(webcam_resized, str(i), (display_width//2 - 100, display_height//2),
                        cv2.FONT_HERSHEY_SIMPLEX, 10, (0, 255, 0), 20)
            if ref_cap:
                ret_ref, ref_frame = ref_cap.read()
                if ret_ref:
                    ref_resized = cv2.resize(ref_frame, (ref_display_width, display_height))
                    combined = np.hstack((ref_resized, webcam_resized))
                    cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', combined)
                else:
                    cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', webcam_resized)
            else:
                cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', webcam_resized)
            cv2.waitKey(1000)
        print(f"{i}...")

    if ref_cap:
        ref_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    if reference_video_path and PYGAME_AVAILABLE:
        try:
            temp_audio = "temp_audio.mp3"
            subprocess.run([FFMPEG_EXE, '-i', reference_video_path, '-q:a', '0', '-map', 'a', temp_audio, '-y'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            pygame.mixer.music.load(temp_audio)
            pygame.mixer.music.play()
            audio_started = True
            print("  ♪ Audio playing...")
        except Exception as e:
            print(f"  Warning: Could not play audio: {e}")

    print("GO! Recording started...")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    target_frames = int(duration * fps)
    recorded_frames = 0
    start_time = time.time()

    while recorded_frames < target_frames:
        ret, frame = cap.read()
        if not ret:
            break
        out.write(frame)
        recorded_frames += 1
        webcam_display = cv2.resize(frame, (display_width, display_height))
        elapsed = time.time() - start_time
        remaining = duration - elapsed
        cv2.putText(webcam_display, f"{remaining:.1f}s", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.circle(webcam_display, (display_width - 30, 30), 15, (0, 0, 255), -1)

        if ref_cap:
            ret_ref, ref_frame = ref_cap.read()
            if ret_ref:
                ref_display = cv2.resize(ref_frame, (ref_display_width, display_height))
                combined = np.hstack((ref_display, webcam_display))
                cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', combined)
            else:
                ref_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret_ref, ref_frame = ref_cap.read()
                if ret_ref:
                    ref_display = cv2.resize(ref_frame, (ref_display_width, display_height))
                    combined = np.hstack((ref_display, webcam_display))
                    cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', combined)
        else:
            cv2.imshow('Dance Challenge - Reference (Left) | You (Right)', webcam_display)
        cv2.waitKey(1)

    if audio_started and PYGAME_AVAILABLE:
        try:
            pygame.mixer.music.stop(); pygame.mixer.quit()
        except Exception:
            pass
        try:
            os.remove("temp_audio.mp3")
        except Exception:
            pass

    out.release(); cap.release()
    if ref_cap: ref_cap.release()
    cv2.destroyAllWindows()
    print(f"✅ Recording complete! Saved {recorded_frames} frames to {output_path}")


def create_side_by_side(
    video1_frames,
    video2_frames,
    audio_source_path,
    output_path="comparison_overlay.mp4",
    fps=30.0,
    target_duration=None,
    alignment_path: Optional[Sequence[Tuple[int, int]]] = None,
):
    """
    Create side-by-side comparison video.
    
    Args:
        video1_frames: Reference video frames (list of np.ndarray)
        video2_frames: User video frames (list of np.ndarray)
        audio_source_path: Path to audio file (typically routine audio)
        output_path: Output video path
        fps: FPS for output video (should match reference video FPS)
        target_duration: Target duration in seconds (if None, uses reference video length)
        alignment_path: Optional DTW alignment path as sequence of (ref_idx, user_idx)
                        pairs. When provided, frames are re-ordered to follow this path
                        so that timing in the comparison matches the scoring alignment.
    """
    len1 = len(video1_frames)
    len2 = len(video2_frames)
    
    if len1 == 0 or len2 == 0:
        raise ValueError("Cannot create comparison: one or both videos have no frames")

    # If we have a DTW alignment path, build aligned frame sequences that
    # follow the same (ref_idx, user_idx) mapping used for scoring.
    if alignment_path:
        aligned_ref = []
        aligned_user = []
        for ia, ib in alignment_path:
            ia = int(ia)
            ib = int(ib)
            if 0 <= ia < len1 and 0 <= ib < len2:
                aligned_ref.append(video1_frames[ia])
                aligned_user.append(video2_frames[ib])
        # Fallback to original sequences if something went wrong
        if aligned_ref and aligned_user and len(aligned_ref) == len(aligned_user):
            video1_frames = aligned_ref
            video2_frames = aligned_user
            len1 = len(video1_frames)
            len2 = len(video2_frames)

    # If no alignment path was provided (or failed), fall back to simple
    # length alignment: truncate to the shorter of the two sequences.
    min_len = min(len1, len2)
    video1_frames = video1_frames[:min_len]
    video2_frames = video2_frames[:min_len]
    
    height = min(video1_frames[0].shape[0], video2_frames[0].shape[0])
    width1 = int(video1_frames[0].shape[1] * height / video1_frames[0].shape[0])
    width2 = int(video2_frames[0].shape[1] * height / video2_frames[0].shape[0])

    temp_output = "temp_comparison.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    # Use the provided FPS (should be reference video FPS)
    out = cv2.VideoWriter(temp_output, fourcc, fps, (width1 + width2, height))

    for f1, f2 in zip(video1_frames, video2_frames):
        f1_resized = cv2.resize(f1, (width1, height))
        f2_resized = cv2.resize(f2, (width2, height))
        out.write(np.hstack((f1_resized, f2_resized)))
    out.release()
    
    print("  Adding audio to comparison video...")
    try:
        # Use reference video duration to ensure proper sync
        cmd = [
            FFMPEG_EXE, '-i', temp_output, '-i', audio_source_path,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
            '-c:a', 'aac', '-b:a', '192k',
            '-map', '0:v:0', '-map', '1:a:0',
            '-shortest',  # Use shortest stream to ensure sync
            '-r', str(fps),  # Set output FPS to match reference
            output_path, '-y'
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        os.remove(temp_output)
        print("  ✓ Audio added successfully!")
    except Exception as e:
        print(f"  Warning: Could not add audio to comparison video: {e}")
        if os.path.exists(temp_output):
            os.rename(temp_output, output_path)
            print("  Created comparison video without audio.")


# ==============================================================================
# Report emitters (JSON + Markdown)
# ==============================================================================

def write_json(path: str, data: dict):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


PRIORITY_SUGGESTIONS = {
    "energy": "Put more energy into the full routine—go bigger with your arms and travel more.",
    "sharpness": "Make the hits crisper—tense your muscles and stop each move sharply.",
    "bounce": "Sit into the groove more—add bounce through your knees and hips.",
    "timing": "Dial in the timing so those transitions land with the music.",
    "arms": "Clean up the arm lines—match the same arm, angle, and pathway as the reference.",
    "legs": "Match the leg pathways—use the same leg and level change as the choreo.",
    "levels": "Stay lifted unless the choreo says otherwise—don’t sink or crouch extra.",
    "head": "Keep your head steadier so the focus stays on the body movement.",
    "cleanliness": "Keep the power but make the shapes cleaner and more precise.",
    "choreo_match": "Review the choreo first so the shapes and directions match before polishing details.",
    "overall": "Keep refining each phrase until the combo feels locked in.",
}


def _overall_verdict(score: float, performance_mode: str, global_stats: Dict[str, float]) -> str:
    energy_ratio = global_stats.get("energy_ratio", 0.0)
    avg_similarity = global_stats.get("avg_similarity", 0.0)
    performance_mode = performance_mode or "on_choreo"

    if performance_mode == "still":
        return ("I couldn’t really grade this run because you barely moved. "
                "Dance the full routine so I can compare the shapes, timing, and energy.")
    if performance_mode == "random":
        return ("This take doesn’t match the reference choreo—it looks more like freestyle. "
                "Lock the base steps in first, then use ChoreoCoach to clean the details.")
    if performance_mode == "marking":
        return ("You’re mostly on the choreography but marking it—push past practice energy and go full out "
                "so the score reflects your actual performance.")

    if score >= 85:
        return "Great job—you’re basically stage-ready. Keep polishing tiny details to hit that perfect score."
    if score >= 70:
        return "Good work! The combo is in your body—now sharpen the lines and timing to climb higher."
    if avg_similarity >= 0.45 and energy_ratio >= 0.6:
        return "You’re in the right ballpark, but the shapes and timing still need cleaning to match the reference."
    return ("This score is low because the shapes/timing are far from the reference. "
            "Break the combo into chunks, relearn the details, then record another pass.")


def _aggregate_strengths_and_priorities(events: List[Dict],
                                        performance_mode: str,
                                        global_stats: Dict[str, float],
                                        score: float) -> Tuple[List[str], List[str]]:
    performance_mode = performance_mode or "on_choreo"
    avg_similarity = global_stats.get("avg_similarity", 0.0)
    energy_ratio = global_stats.get("energy_ratio", 0.0)
    strengths: List[str] = []
    priorities: List[str] = []

    category_max: Counter = Counter()
    for ev in events:
        cat = ev.get("category") or "overall"
        severity = int(ev.get("severity", 1))
        if severity > category_max.get(cat, 0):
            category_max[cat] = severity

    if performance_mode == "still":
        strengths.append("Camera/framing looks good—now give me the full choreo so I can coach the details.")
        priorities.extend([
            "Dance the entire combo instead of staying still so the comparison means something.",
            "Match the reference energy—move with the music and hit the shapes.",
        ])
        return strengths, priorities

    if performance_mode == "random":
        if energy_ratio >= 0.5:
            strengths.append("You’re bringing solid energy—love the commitment.")
        else:
            strengths.append("You’re comfortable moving on camera—next step is locking the actual choreo.")
        priorities.extend([
            "Relearn the reference combo so your shapes and directions match before we clean details.",
            "Once the choreo is locked, use me to dial in arms, legs, and timing.",
        ])
        if energy_ratio < 0.6:
            priorities.append("Push more energy so the shapes pop once you’re on the right moves.")
        return strengths, priorities

    if score >= 80 or avg_similarity >= 0.6:
        strengths.append("Your overall timing/structure is close to the reference.")
    if energy_ratio >= 0.9:
        strengths.append("You’re matching the reference energy through most of the piece.")
    if category_max.get("timing", 0) <= 1:
        strengths.append("Timing is generally on the beat.")
    if not strengths:
        strengths.append("You’ve got the combo recorded—keep iterating and it’ll tighten up fast.")
    strengths = _dedupe_preserve_order(strengths)

    ordered_categories = sorted(category_max.items(), key=lambda kv: kv[1], reverse=True)
    for cat, severity in ordered_categories:
        if severity < 2:
            continue
        suggestion = PRIORITY_SUGGESTIONS.get(cat, "Keep cleaning this section until it matches the reference.")
        priorities.append(suggestion)
        if len(priorities) >= 3:
            break

    if performance_mode == "marking" and "energy" not in category_max:
        priorities.insert(0, PRIORITY_SUGGESTIONS["energy"])

    if not priorities:
        priorities.append("Keep polishing the fine details—another focused run can push the score even higher.")

    return strengths, priorities


def _select_detailed_events(events: List[Dict], limit: int = 30) -> List[Dict]:
    if not events:
        return []
    events_with_summary = [ev for ev in events if ev.get("summary")]
    if not events_with_summary:
        return []
    prioritized = sorted(
        events_with_summary,
        key=lambda e: (-e.get("severity", 1), -len(e.get("notes", [])), e.get("t_ref", e.get("t_user", 0.0))))
    selected = prioritized[:limit]
    selected.sort(key=lambda e: e.get("t_ref", e.get("t_user", 0.0)))
    return selected


def write_markdown(path: str, summary: Dict, events: List[Dict]):
    score = float(summary.get("score", 0.0) or 0.0)
    thresholds = summary.get("thresholds", {}) or {}
    performance_mode = summary.get("performance_mode") or "on_choreo"
    global_stats = summary.get("global_stats") or {}

    verdict = _overall_verdict(score, performance_mode, global_stats)
    strengths, priorities = _aggregate_strengths_and_priorities(events, performance_mode, global_stats, score)
    detailed_events = _select_detailed_events(events, limit=30)

    lines: List[str] = []
    lines.append("# ChoreoCoach Critique\n")
    lines.append(f"**Overall Score:** {score:.1f}/100\n")
    lines.append(f"{verdict}\n")

    lines.append("## What you're doing well")
    if strengths:
        for item in strengths:
            lines.append(f"- {item}")
    else:
        lines.append("- Keep showing up and giving me full-out runs—consistency wins.")
    lines.append("")

    lines.append("## Top things to improve next")
    if priorities:
        for item in priorities:
            lines.append(f"- {item}")
    else:
        lines.append("- Keep polishing—no major red flags popped up.")
    lines.append("")

    lines.append("## Detailed timestamps")
    if not detailed_events:
        lines.append("No timestamped notes this time—either the run was clean or I need a fuller-out take.")
    else:
        for ev in detailed_events:
            t = ev.get("t_ref", ev.get("t_user", 0.0))
            summary_line = ev.get("summary") or "; ".join(ev.get("notes", []))
            lines.append(f"- **{t:0.2f}s** — {summary_line}")

    with open(path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines) + "\n")


# ==============================================================================
# Main pipeline (upgraded)
# ==============================================================================

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(script_dir)
    
    actual_video_path = os.path.join(backend_dir, "actual", "actual.mp4")
    test_video_path = os.path.join(backend_dir, "test", "test.mp4")
    
    print(f"Script location: {script_dir}")
    print(f"Backend directory: {backend_dir}")
    print(f"Looking for actual.mp4 at: {actual_video_path}")
    print(f"Will save test.mp4 to: {test_video_path}")
    
    if not os.path.exists(actual_video_path):
        print(f"\n❌ ERROR: Could not find actual.mp4 at {actual_video_path}")
        exit(1)

    print("="*60)
    print("🕺 DANCE SIMILARITY CHALLENGE 💃")
    print("="*60)

    # Step 1: Get length
    print("\n[1/7] Reading actual.mp4...")
    duration, frame_count, fps_ref = get_video_length(actual_video_path)
    print(f"✓ actual.mp4 is {duration:.2f} s ({frame_count} frames @ {fps_ref:.2f} FPS)")

    # Step 2: Record webcam
    print(f"\n[2/7] 🎥 Preparing to record for {duration:.2f} seconds...")
    time.sleep(1.5)
    record_webcam_with_countdown(test_video_path, duration, fps=int(round(fps_ref)), reference_video_path=actual_video_path)

    # Step 3: Extract poses
    print("\n[3/7] 📊 Processing videos and extracting poses...")
    print("  Processing actual.mp4...")
    actual_seq, actual_frames, actual_angles, actual_valid, actual_embeddings, actual_visibility = extract_pose_keypoints(actual_video_path)
    print("  Processing test.mp4...")
    test_seq, test_frames, test_angles, test_valid, test_embeddings, test_visibility = extract_pose_keypoints(test_video_path)

    # Step 4: Alignment + score + critiques
    print("\n[4/7] 🧮 Aligning and scoring...")
    _, _, fps_user = get_video_length(test_video_path)
    result = align_and_score(actual_seq, test_seq,
    actual_angles, test_angles,
                             actual_valid, test_valid,
                             fps_ref, fps_user,
                             actual_embeddings, test_embeddings,
                             actual_visibility, test_visibility)

    score = result['score']
    path = result['path']
    events = result['events']

    # Step 5: Optional audio analysis (beats/onsets) for future overlay/reference
    print("\n[5/7] 🎵 Beat/Onset analysis (optional)...")
    beats = {"ref": np.array([]), "user": np.array([])}
    if LIBROSA_AVAILABLE:
        ref_wav = os.path.join(script_dir, "_ref.wav")
        usr_wav = os.path.join(script_dir, "_usr.wav")
        if extract_audio_to_wav(actual_video_path, ref_wav):
            b = compute_beats_and_onsets(ref_wav); beats['ref'] = b['beats']
        if extract_audio_to_wav(test_video_path, usr_wav):
            b = compute_beats_and_onsets(usr_wav); beats['user'] = b['beats']
        # Clean temp
        for p in [ref_wav, usr_wav]:
            try: os.remove(p)
            except Exception: pass
    else:
        print("  (librosa not installed — skipping beat extraction)")

    # Step 6: Create side-by-side video
    print("\n[6/7] 🎬 Creating side-by-side comparison video...")
    create_side_by_side(actual_frames, test_frames, actual_video_path, output_path="comparison_overlay.mp4")

    # Step 7: Emit report artifacts
    print("\n[7/7] 📝 Emitting critique artifacts...")
    report_json = {
        "score": score,
        "thresholds": result['thresholds'],
        "timing_ms_curve": result['timing_ms_curve'],
        "events": events,
        "meta": {
            "fps_ref": fps_ref,
            "fps_user": fps_user,
            "n_ref_frames": len(actual_seq),
            "n_user_frames": len(test_seq),
            "dtw_pairs": len(path),
        },
        "beats": {"ref": beats['ref'].tolist(), "user": beats['user'].tolist()}
    }

    os.makedirs(os.path.join(backend_dir, 'out'), exist_ok=True)
    json_path = os.path.join(backend_dir, 'out', 'critique.json')
    md_path   = os.path.join(backend_dir, 'out', 'critique.md')

    write_json(json_path, report_json)
    write_markdown(md_path, {"score": score, "thresholds": result['thresholds']}, events)

    # Final console summary
    print("\n" + "="*60)
    print(f"💃🕺 DANCE SIMILARITY SCORE: {score}/100")
    print("="*60)
    if score >= 80:
        print("🔥 Excellent! Almost perfect match!")
    elif score >= 60:
        print("✨ Great job! Very similar moves!")
    elif score >= 40:
        print("👍 Good effort! Some similarities detected.")
    elif score >= 20:
        print("📈 Keep practicing! Some differences detected.")
    else:
        print("💪 Keep going! More practice needed.")
    
    print("\n✅ Done!")
    print(f"📁 Your recording: {test_video_path}")
    print(f"📁 Comparison video: comparison_overlay.mp4")
    print(f"📄 JSON report: {json_path}")
    print(f"📝 Markdown report: {md_path}")
    print("\nNotes:\n - Reports include timestamped coaching notes (energy, sharpness, bounce, timing, angles).\n - Install optional deps for best results: librosa, fastdtw, imageio-ffmpeg, pygame.")
