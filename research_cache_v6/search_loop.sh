#!/bin/bash
cd /home/z/my-project/research_cache_v6

# Array of searches: "filename|query"
searches=(
  "nested_groups|nested layer groups accordion tree component UX design"
  "blend_dropdown|blend mode dropdown live preview hover design pattern"
  "inline_layer_rename|layer inline rename edit UX design pattern"
  "ae_graph_editor|After Effects graph editor bezier easing curve UX"
  "figma_smart_animate|Figma smart animate auto transition UX design"
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
  sleep 18
done
echo "Batch complete"
