#!/usr/bin/env bash
# Prepares a phone screen recording of Berby for review: probes the video, extracts frames,
# and lists freezes (stretches of identical consecutive frames, i.e. stutter or hangs).
#
#   scripts/analyze-recording.sh playtests/<recording>.mp4 [frames per second, default 2]
#
# Writes playtests/<recording>/info.txt, frames/f0001.jpg ... and freezes.txt. The playtests/
# folder is gitignored. Needs ffmpeg (brew install ffmpeg). Compatible with bash 3.2.
set -euo pipefail

command -v ffmpeg >/dev/null || { echo "ffmpeg is required: brew install ffmpeg" >&2; exit 1; }
video="${1:?usage: $0 <video> [fps]}"
fps="${2:-2}"
name="$(basename "${video%.*}")"
out="playtests/$name"
mkdir -p "$out/frames"

echo "== $video"
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,avg_frame_rate,nb_frames -show_entries format=duration \
  -of default=noprint_wrappers=1 "$video" | tee "$out/info.txt"

rm -f "$out"/frames/f*.jpg
ffmpeg -v error -y -i "$video" -vf "fps=$fps,scale=960:-2" -q:v 3 "$out/frames/f%04d.jpg"
echo "frames: $(ls "$out/frames" | wc -l | tr -d ' ') at $fps per second in $out/frames (frame N is at t = (N-1)/$fps s)"

# Freezes of at least 100 ms. freezedetect logs freeze_start / freeze_duration / freeze_end.
ffmpeg -v info -i "$video" -vf "freezedetect=n=-60dB:d=0.1" -an -f null - 2>&1 \
  | grep -oE "freeze_(start|duration|end): [0-9.]+" > "$out/freezes.txt" || true
if [[ -s "$out/freezes.txt" ]]; then
  echo "freezes (start / duration / end, seconds):"
  paste - - - < "$out/freezes.txt"
else
  echo "no freezes of 100 ms or more"
fi
