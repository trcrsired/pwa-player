const fs = require("fs");
const path = require("path");
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

    // manifest.json → minify JSON
    if (ext === ".json" && path.basename(srcPath) === "manifest.json") {
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

// Clean docsput folder
if (fs.existsSync(docs)) {
    fs.rmSync(docs, { recursive: true, force: true });
}
ensureDir(docs);

// Start build
walk(src).then(() => console.log("\nBuild complete!"));
