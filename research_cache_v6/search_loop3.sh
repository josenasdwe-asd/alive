#!/bin/bash
cd /home/z/my-project/research_cache_v6

searches=(
  "framer_motion_timeline|Framer Motion code based animation timeline"
  "timeline_scrubbing|timeline scrubbing UX feel good audio video"
  "keyframe_types_ui|linear ease bezier hold keyframe UI icons"
  "onion_skinning|onion skinning animation frames UI"
  "transform_handles|transform handles move scale rotate UX design"
)

for entry in "${searches[@]}"; do
  filename="${entry%%|*}"
  query="${entry##*|}"
  echo "=== Searching: $query ==="
  z-ai function -n web_search -a "{\"query\": \"$query\", \"num\": 8}" -o "${filename}.json" 2>&1 | tail -2
  sleep 25
done
echo "Batch complete"
