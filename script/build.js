const fs = require("fs");
const path = require("path");
const UglifyJS = require("uglify-js");

const root = process.argv[2];
if (!root) {
    console.log("Usage: node script/build.js <project_root>");
    process.exit(1);
}

const src = path.join(root, "source");
const out = path.join(root, "output");

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyOrMinify(srcPath, outPath) {
    const ext = path.extname(srcPath).toLowerCase();

    // JS → uglify
    if (ext === ".js") {
        const code = fs.readFileSync(srcPath, "utf8");
        const result = UglifyJS.minify(code, { compress: true, mangle: true });

        if (result.error) {
            console.error("Uglify error in:", srcPath);
            console.error(result.error);
            return;
        }

        ensureDir(path.dirname(outPath));
        fs.writeFileSync(outPath, result.code, "utf8");
        console.log("JS:", srcPath);
        return;
    }

    // Everything else → copy
    ensureDir(path.dirname(outPath));
    fs.copyFileSync(srcPath, outPath);
    console.log("COPY:", srcPath);
}

function walk(dir, baseOut) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const srcPath = path.join(dir, entry.name);
        const relPath = path.relative(src, srcPath);
        const outPath = path.join(baseOut, relPath);

        if (entry.isDirectory()) {
            walk(srcPath, baseOut);
        } else {
            copyOrMinify(srcPath, outPath);
        }
    }
}

// Clean output folder
if (fs.existsSync(out)) {
    fs.rmSync(out, { recursive: true, force: true });
}
ensureDir(out);

// Start build
walk(src, out);
console.log("\nBuild complete!");
