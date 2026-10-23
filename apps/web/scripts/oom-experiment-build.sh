#!/usr/bin/env bash
# EXPERIMENT ONLY (GEO-3453), not for master: runs `next build` while sampling
# the build container's cgroup memory, then prints the peak.
# OOM_EXPERIMENT_RUN: bump to force a new preview build of the same variant.
OOM_EXPERIMENT_RUN=5
# Per-variant knobs: extra env for next build, and extra next build flags.
OOM_EXPERIMENT_ENV=""
OOM_EXPERIMENT_NEXT_ARGS=""

log=/tmp/oom-mem.tsv
cg=""
if [ -f /sys/fs/cgroup/memory.current ]; then
  cg=v2
  cur_file=/sys/fs/cgroup/memory.current
  stat_file=/sys/fs/cgroup/memory.stat
elif [ -f /sys/fs/cgroup/memory/memory.usage_in_bytes ]; then
  cg=v1
  cur_file=/sys/fs/cgroup/memory/memory.usage_in_bytes
  stat_file=/sys/fs/cgroup/memory/memory.stat
fi

echo "[oom-experiment] run=$OOM_EXPERIMENT_RUN cgroup=${cg:-none} VERCEL_ENV=${VERCEL_ENV:-unset} nproc=$(nproc 2>/dev/null)"
[ -n "$cg" ] && ls /sys/fs/cgroup/ | tr '\n' ' ' | sed 's/^/[oom-experiment] cgroup files: /' && echo
for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory/memory.max_usage_in_bytes; do
  [ -f "$f" ] && echo "[oom-experiment] at start $f=$(cat "$f")"
done
grep -E "^MemTotal|^MemAvailable" /proc/meminfo | sed 's/^/[oom-experiment] /'

stat_val() { awk -v k="$1" '$1==k{print $2}' "$stat_file" 2>/dev/null; }

sample() {
  local start best=0 printed=0 maxthreads=0 t cur anon file th
  start=$(date +%s)
  : > "$log"
  while :; do
    t=$(( $(date +%s) - start ))
    if [ -n "$cg" ]; then
      cur=$(cat "$cur_file")
      if [ "$cg" = v2 ]; then anon=$(stat_val anon); file=$(stat_val file); else anon=$(stat_val rss); file=$(stat_val cache); fi
    else
      cur=$(( ( $(awk '/^MemTotal/{print $2}' /proc/meminfo) - $(awk '/^MemAvailable/{print $2}' /proc/meminfo) ) * 1024 ))
      anon=0; file=0
    fi
    echo -e "$t\t$((cur/1048576))\t$((anon/1048576))\t$((file/1048576))" >> "$log"
    th=$(awk '/^Name/{n=$2} /^Threads/{if(n ~ /^next-build/) print $2}' /proc/[0-9]*/status 2>/dev/null | sort -n | tail -1)
    if [ -n "$th" ] && [ "$th" -gt "$maxthreads" ]; then maxthreads=$th; echo "$maxthreads" > /tmp/oom-threads.txt; fi
    if [ "$cur" -gt "$best" ]; then
      best=$cur
      # Printed live so an OOM-killed run still leaves its peak in the log.
      if [ $((cur - printed)) -gt 262144000 ]; then printed=$cur; echo "[oom-experiment] live peak t=${t}s total=$((cur/1048576))MB anon=$((anon/1048576))MB next-build threads=${th:-?}"; fi
      {
        echo "t=${t}s total=$((cur/1048576))MB anon=$((anon/1048576))MB file=$((file/1048576))MB"
        for s in /proc/[0-9]*/status; do
          awk '/^Name/{n=$2} /^VmRSS/{r=$2} /^RssAnon/{a=$2} /^Threads/{h=$2} END{if(r>51200) printf "  %6d MB rss %6d MB anon %4d threads  %s\n", r/1024, a/1024, h, n}' "$s" 2>/dev/null
        done | sort -rn | head -8
      } > /tmp/oom-peak.txt
    fi
    sleep 0.5
  done
}

sample &
sampler=$!

echo "[oom-experiment] running: env $OOM_EXPERIMENT_ENV next build $OOM_EXPERIMENT_NEXT_ARGS"
env $OOM_EXPERIMENT_ENV next build $OOM_EXPERIMENT_NEXT_ARGS
rc=$?

kill "$sampler" 2>/dev/null
echo "[oom-experiment] next build exit=$rc"
peak=$(sort -t$'\t' -k2 -n "$log" | tail -1)
echo "[oom-experiment] sampled peak (t s, total MB, anon MB, file MB): $peak"
cat /tmp/oom-peak.txt | sed 's/^/[oom-experiment] /'
echo "[oom-experiment] max next-build threads seen: $(cat /tmp/oom-threads.txt 2>/dev/null || echo none)"
for f in /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory/memory.max_usage_in_bytes; do
  [ -f "$f" ] && echo "[oom-experiment] $f=$(( $(cat "$f") / 1048576 ))MB"
done
[ -f /sys/fs/cgroup/memory.events ] && sed 's/^/[oom-experiment] memory.events /' /sys/fs/cgroup/memory.events
# Coarse timeline: one line every ~5s.
awk 'NR%10==1' "$log" | tr '\n' ' ' | sed 's/^/[oom-experiment] timeline t,total,anon,file: /'
echo
exit $rc
