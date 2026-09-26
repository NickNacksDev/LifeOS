#!/bin/bash
DEFAULT="\e[0m"
GREEN="\e[32m"
RED="\e[31m"

# Helper functions
check_for_modelfile_in_dir() {
    directory="$1"
    directory_content=(`ls -f "$directory"`)
    for item in "${directory_content[@]}"; do
        [[ "Modelfile" == "$item" ]] && return 0
    done
    return 1
}

print_error() {
    msg="$1"
    echo -e "${RED}[  ERROR  ] $msg${DEFAULT}"
}

print_success() {
    msg="$1"
    echo -e "${GREEN}[ SUCCESS ] $msg${DEFAULT}"
}

# Get list of directories in current directory
modelfile_directories=`ls -d ../modelfiles/*/`

# Ensure each directory contains a modelfile
# Then, create that modelfile
for directory in ${modelfile_directories[@]}; do
    if check_for_modelfile_in_dir "$directory"; then
        filename=`echo ${directory%?} | xargs -n 1 basename`
        ollama create -f $directory/Modelfile "$filename" &> /dev/null
        [ $? -eq 0 ] && print_success "$filename" || print_error "$filename"
    else
        echo "${directory%?}: Modelfile not found. Skipping..."
    fi
done