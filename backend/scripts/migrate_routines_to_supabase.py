#!/usr/bin/env python3
"""
Migration script to upload all existing routines from local storage to Supabase.
Run this once to migrate all routines that were created before Supabase was configured.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.main import (
    _load_index,
    _write_index,
    _upload_to_supabase_storage,
    ROUTINES_INDEX_PATH,
    BASE_DIR,
    SUPABASE_AVAILABLE,
    supabase_client
)

def migrate_routines():
    """Migrate all routines from local storage to Supabase."""
    
    if not SUPABASE_AVAILABLE or not supabase_client:
        print("❌ Supabase client not available. Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        return False
    
    routines_index = _load_index(ROUTINES_INDEX_PATH)
    
    if not routines_index:
        print("⚠️  No routines found in index")
        return True
    
    print(f"📊 Found {len(routines_index)} routines to check\n")
    
    migrated_count = 0
    skipped_count = 0
    failed_count = 0
    
    for routine_id, routine in routines_index.items():
        title = routine.get("title", "Untitled")
        video_supabase_url = routine.get("video_supabase_url")
        audio_supabase_url = routine.get("audio_supabase_url")
        
        # Skip if already migrated
        if video_supabase_url and audio_supabase_url:
            print(f"⏭️  Skipping '{title}' ({routine_id[:8]}...) - already in Supabase")
            skipped_count += 1
            continue
        
        # Check for local files
        video_path = routine.get("video_path")
        audio_path = routine.get("audio_path")
        
        if not video_path or not audio_path:
            print(f"⚠️  Skipping '{title}' ({routine_id[:8]}...) - no local paths found")
            skipped_count += 1
            continue
        
        local_video_path = BASE_DIR / video_path.replace("\\", "/")
        local_audio_path = BASE_DIR / audio_path.replace("\\", "/")
        
        if not local_video_path.exists() or not local_audio_path.exists():
            print(f"⚠️  Skipping '{title}' ({routine_id[:8]}...) - local files not found")
            skipped_count += 1
            continue
        
        # Upload to Supabase
        print(f"📤 Migrating '{title}' ({routine_id[:8]}...)")
        
        video_storage_path = f"routines/{routine_id}/video.mp4"
        audio_storage_path = f"routines/{routine_id}/audio.mp3"
        
        video_url = _upload_to_supabase_storage(local_video_path, "videos", video_storage_path)
        audio_url = _upload_to_supabase_storage(local_audio_path, "audio", audio_storage_path)
        
        if video_url and audio_url:
            routine["video_supabase_url"] = video_url
            routine["audio_supabase_url"] = audio_url
            routines_index[routine_id] = routine
            migrated_count += 1
            print(f"   ✅ Successfully migrated to Supabase")
        else:
            failed_count += 1
            print(f"   ❌ Failed to upload to Supabase")
    
    # Save updated index
    if migrated_count > 0:
        _write_index(ROUTINES_INDEX_PATH, routines_index)
        print(f"\n💾 Updated routines index")
    
    print(f"\n📊 Migration Summary:")
    print(f"   ✅ Migrated: {migrated_count}")
    print(f"   ⏭️  Skipped: {skipped_count}")
    print(f"   ❌ Failed: {failed_count}")
    
    return failed_count == 0

if __name__ == "__main__":
    print("🚀 Starting routine migration to Supabase...\n")
    success = migrate_routines()
    sys.exit(0 if success else 1)

