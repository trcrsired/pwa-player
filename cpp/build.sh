#!/bin/sh
# Build source/pwaplayer.wasm from cpp/pwaplayer.cpp.
#
# Mirrors the WasmPass (https://github.com/trcrsired/WasmPass) setup: a
# wasm32-wasip1 sysroot through a clang --config file, exceptions and RTTI
# off (herbceptions are used instead of C++ exceptions), thin LTO and a
# stripped binary.
#
# Usage: sh cpp/build.sh [project_root]
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "${1:-}" != "" ]; then
    ROOT=$(CDPATH= cd -- "$1" && pwd)
fi

CONFIG=${PWA_WASM_CONFIG:-$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg}
CXX=${CXX:-clang++}

if [ ! -f "$CONFIG" ]; then
    echo "error: wasm config not found: $CONFIG" >&2
    echo "set PWA_WASM_CONFIG to your wasm32-wasip1 --config file" >&2
    exit 1
fi

EXPORTS="
-Wl,--export=__wasm_call_ctors
-Wl,--export=iptv_channel_count
-Wl,--export=iptv_channel_name
-Wl,--export=iptv_channel_url_count
-Wl,--export=iptv_channel_url
-Wl,--export=iptv_channel_flags
-Wl,--export=pwa_input_ptr
-Wl,--export=pwa_input_capacity
-Wl,--export=iptv_filtered_count
-Wl,--export=iptv_render_page
-Wl,--export=iptv_html_ptr
-Wl,--export=iptv_html_len
-Wl,--export=iptv_out_ptr
-Wl,--export=iptv_out_len
-Wl,--export=shuffle_permutation
-Wl,--export=shuffle_permutation_ptr
-Wl,--export=shuffle_permutation_len
-Wl,--export=pwa_url_flags
"

mkdir -p "$ROOT/source"

# shellcheck disable=SC2086
"$CXX" --config="$CONFIG" \
    -fherbceptions -lherbceptions \
    -flto=thin -s -Oz \
    -fno-exceptions -fno-rtti \
    -nostartfiles -Wl,--no-entry \
    $EXPORTS \
    -o "$ROOT/source/pwaplayer.wasm" \
    "$ROOT/cpp/pwaplayer.cpp"

ls -l "$ROOT/source/pwaplayer.wasm"
