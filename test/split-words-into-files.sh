#!/bin/bash

INFILE="${1:?no infile provided}"
OUTDIR="${2:?no outDir provided}"

cd "${OUTDIR}" || exit

index=0
while IFS= read -r -d ' ' word || [ -n "$word" ] ; do
  if [ -n "$word" ]; then
    filename="word_$(printf "%04d" $index).txt"
    echo "$word" > "$filename"
    index=$((index + 1))
  fi
done < "${INFILE}"

echo "# Created ${index} word files" > summary.md
