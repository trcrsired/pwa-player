const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const UglifyJS = require("uglify-js");
const { minify: minifyHTML } = require("html-minifier-terser");
const CleanCSS = require("clean-css");

const root = process.argv[2];
if (!root) {
    console.log("Usage: node script/build.js <project_root>");
    process.exit(1);
}

const src = path.join(root, "source");
const docs = path.join(root, "docs");

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

// Rebuild source/pwaplayer.wasm:
//   1. cpp/iptvchannels.js  ->  cpp/iptv_channels_data.inc (C++ constexpr table)
//   2. cpp/pwaplayer.cpp    ->  source/pwaplayer.wasm       (needs clang++)
// The wasm output is a normal source/ asset, so the walk below copies it to
// docs/ untouched (it is already binary and stripped).
function buildWasm(root) {
    try {
        execFileSync(process.execPath, [path.join(__dirname, "gen_iptv_cpp.js"), root], { stdio: "inherit" });
    } catch (err) {
        console.error("IPTV table codegen failed:", err.message);
    }

    try {
        execFileSync("sh", [path.join(root, "cpp", "build.sh"), root], { stdio: "inherit" });
    } catch (err) {
        console.warn("WASM build skipped (keeping the existing source/pwaplayer.wasm):", err.message);
    }
}

async function processFile(srcPath, docsPath) {
    const ext = path.extname(srcPath).toLowerCase();
    const content = fs.readFileSync(srcPath, "utf8");

    // HTML → html-minifier-terser
    if (ext === ".html") {
        const result = await minifyHTML(content, {
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true
        });
        ensureDir(path.dirname(docsPath));
        fs.writeFileSync(docsPath, result, "utf8");
        console.log("HTML:", srcPath);
        return;
    }

    // CSS → clean-css
    if (ext === ".css") {
        const result = new CleanCSS().minify(content).styles;
        ensureDir(path.dirname(docsPath));
        fs.writeFileSync(docsPath, result, "utf8");
        console.log("CSS:", srcPath);
        return;
    }

    // JS → uglify-js
    if (ext === ".js") {
        const result = UglifyJS.minify(content, { compress: true, mangle: true });
        if (result.error) {
            console.error("UglifyJS error in:", srcPath);
            console.error(result.error);
            return;
        }
        ensureDir(path.dirname(docsPath));
        fs.writeFileSync(docsPath, result.code, "utf8");
        console.log("JS:", srcPath);
        return;
    }

    // JSON (manifest, locales) → minify
    if (ext === ".json") {
        const result = JSON.stringify(JSON.parse(content));
        ensureDir(path.dirname(docsPath));
        fs.writeFileSync(docsPath, result, "utf8");
        console.log("JSON:", srcPath);
        return;
    }

    // Everything else → copy
    ensureDir(path.dirname(docsPath));
    fs.copyFileSync(srcPath, docsPath);
    console.log("COPY:", srcPath);
}

async function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const srcPath = path.join(dir, entry.name);
        const relPath = path.relative(src, srcPath);
        const docsPath = path.join(docs, relPath);

        if (entry.isDirectory()) {
            await walk(srcPath);
        } else {
            await processFile(srcPath, docsPath);
        }
    }
}

// Rebuild the WebAssembly core (IPTV catalogue + shuffle) before the walk, so
// source/pwaplayer.wasm always matches cpp/pwaplayer.cpp.
buildWasm(root);

// Clean docsput folder
if (fs.existsSync(docs)) {
    try
    {
        fs.rmSync(docs, { recursive: true, force: true });
    }
    catch(err)
    {
        console.warn(err);
    }
}
ensureDir(docs);

// Start build
walk(src).then(() => console.log("\nBuild complete!"));
