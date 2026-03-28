import os
import sys
import shutil
import rjsmin
import rcssmin
import htmlmin

def process_file(src_path, out_path):
    ext = os.path.splitext(src_path)[1].lower()

    with open(src_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # HTML
    if ext == ".html":
        result = htmlmin.minify(
            content,
            remove_comments=True,
            remove_empty_space=True,
            reduce_boolean_attributes=True,
            remove_optional_attribute_quotes=False
        )
        print("HTML:", src_path)

    # CSS
    elif ext == ".css":
        result = rcssmin.cssmin(content)
        print("CSS:", src_path)

    # JS
    elif ext == ".js":
        result = rjsmin.jsmin(content)
        print("JS:", src_path)

    # Other files → copy directly
    else:
        shutil.copy2(src_path, out_path)
        print("COPY:", src_path)
        return

    # Write minified output
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(result)


def walk(src_root, out_root):
    for root, dirs, files in os.walk(src_root):
        for file in files:
            src_path = os.path.join(root, file)
            rel_path = os.path.relpath(src_path, src_root)
            out_path = os.path.join(out_root, rel_path)
            process_file(src_path, out_path)


def main():
    if len(sys.argv) != 2:
        print("Usage: python build.py <project_root>")
        return

    root = sys.argv[1]
    src = os.path.join(root, "source")
    out = os.path.join(root, "output")

    if not os.path.isdir(src):
        print("Source directory does not exist:", src)
        return

    if os.path.exists(out):
        shutil.rmtree(out)

    os.makedirs(out, exist_ok=True)

    walk(src, out)
    print("\nBuild complete!")


if __name__ == "__main__":
    main()
import os
import sys
import shutil
import rjsmin
import rcssmin
import htmlmin

def process_file(src_path, out_path):
    ext = os.path.splitext(src_path)[1].lower()

    with open(src_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # HTML
    if ext == ".html":
        result = htmlmin.minify(
            content,
            remove_comments=True,
            remove_empty_space=True,
            reduce_boolean_attributes=True,
            remove_optional_attribute_quotes=False
        )
        print("HTML:", src_path)

    # CSS
    elif ext == ".css":
        result = rcssmin.cssmin(content)
        print("CSS:", src_path)

    # JS
    elif ext == ".js":
        result = rjsmin.jsmin(content)
        print("JS:", src_path)

    # Other files → copy directly
    else:
        shutil.copy2(src_path, out_path)
        print("COPY:", src_path)
        return

    # Write minified output
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(result)


def walk(src_root, out_root):
    for root, dirs, files in os.walk(src_root):
        for file in files:
            src_path = os.path.join(root, file)
            rel_path = os.path.relpath(src_path, src_root)
            out_path = os.path.join(out_root, rel_path)
            process_file(src_path, out_path)


def main():
    if len(sys.argv) != 3:
        print("Usage: python build.py <source_dir> <output_dir>")
        return

    src = sys.argv[1]
    out = sys.argv[2]

    if not os.path.isdir(src):
        print("Source directory does not exist:", src)
        return

    if os.path.exists(out):
        shutil.rmtree(out)

    os.makedirs(out, exist_ok=True)

    walk(src, out)
    print("\nBuild complete!")


if __name__ == "__main__":
    main()
