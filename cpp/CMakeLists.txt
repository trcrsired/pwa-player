cmake_minimum_required(VERSION 3.20)
project(pwa_player_wasm LANGUAGES CXX)

# Produces source/pwaplayer.wasm — the IPTV catalogue + shuffle core.
#
# This mirrors the WasmPass (https://github.com/trcrsired/WasmPass) setup. The
# plain clang++ invocation in cpp/build.sh is the primary path (it is what
# build/build.js calls); this file exists so the module can also be built with
# a normal CMake toolchain file, e.g.
#
#   cmake -S cpp -B cpp/build \
#         -DCMAKE_CXX_COMPILER=clang++ \
#         -DCMAKE_CXX_FLAGS="--config=$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg -fherbceptions -lherbceptions -flto=thin -s" \
#         -DFAST_IO_DIR=$HOME/libraries/fast_io
#   cmake --build cpp/build

set(CMAKE_CXX_STANDARD 26)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(pwaplayer.wasm pwaplayer.cpp)

set(FAST_IO_DIR "" CACHE PATH "Path to a fast_io checkout/installation")

target_compile_options(pwaplayer.wasm PRIVATE
    -fno-exceptions
    -fno-rtti
    -Oz
)

if(FAST_IO_DIR)
    target_include_directories(pwaplayer.wasm PRIVATE "${FAST_IO_DIR}/include")
endif()

# -nostartfiles: we drive initialisation from JS via __wasm_call_ctors
# --no-entry   : the module is a library, not a command
target_link_options(pwaplayer.wasm PRIVATE
    -flto=thin
    -s
    -nostartfiles
    -Wl,--no-entry
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
)

install(TARGETS pwaplayer.wasm RUNTIME DESTINATION .)
