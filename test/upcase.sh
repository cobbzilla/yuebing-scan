#!/bin/sh
IN_FILE="${1:?no infile provided}"
OUT_DIR="${2:?no outDir provided}"

tr '[:lower:]' '[:upper:]' < "${IN_FILE}" > "${OUT_DIR}"/upcase.txt
