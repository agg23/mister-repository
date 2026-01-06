const process = require("process");
const crypto = require("crypto");
const pathModule = require("path");
const fs = require("fs").promises;

const dbID = "agg23_db";

const ignoredFiles = [".gitkeep"];
const ignoredDirectories = [".git", ".github"];

if (process.argv.length != 4) {
  console.log("Expected local_manifest.js [asset dir] [base http url]");
  process.exit(1);
}

const assetDir = pathModule.resolve(process.argv[2]);
let baseUrl = process.argv[3];

if (!baseUrl.endsWith("/")) {
  baseUrl = `${baseUrl}/`;
}

const md5Hash = (buffer) =>
  crypto.createHash("md5").update(buffer).digest("hex");

// Taken from https://stackoverflow.com/a/45130990/2108817
async function* getFilesRecursive(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  for (const dirent of dirents) {
    const res = pathModule.resolve(dir, dirent.name);

    if (dirent.isDirectory()) {
      yield* getFilesRecursive(res);
      yield [res, dirent];
    } else {
      yield [res, dirent];
    }
  }
}

const getFolders = async (path) => {
  const nodes = await fs.readdir(path, { withFileTypes: true });

  return nodes
    .filter((n) => n.isDirectory())
    .map((n) => ({
      path: pathModule.resolve(path, n.name),
      name: n.name,
    }));
};

// Note: This is very simple and isn't going to work in a lot of cases
// I just need to write this fast, not make it good
const shouldSkipEntry = (path) => {
  for (const directory of ignoredDirectories) {
    if (path.includes(directory)) {
      return true;
    }
  }

  const filename = pathModule.basename(path);

  if (ignoredFiles.includes(filename)) {
    return true;
  }

  return false;
};

const posixPath = (path) =>
  path.split(pathModule.sep).join(pathModule.posix.sep);

const parseFile = async (path, parentPath, coreName) => {
  const file = await fs.readFile(path);
  const hash = md5Hash(file);

  let relativePath = posixPath(pathModule.relative(parentPath, path));
  const urlPath = posixPath(pathModule.relative(assetDir, path));

  const tags = [coreName.toLowerCase()];
  const parts = relativePath.split("/");
  let pext = false;

  if (parts[0].length > 0) {
    const firstDir = parts[0].toLowerCase();
    if (firstDir == "games") {
      // This is in the relocatable paths. Set 'path' to 'pext' later.
      pext = true;
    }
    if (firstDir.startsWith("_")) {
      tags.push(firstDir.slice(1));
    } else {
      tags.push(firstDir);
    }
  }

  return {
    path: relativePath,
    hash,
    size: file.length,
    url: `${baseUrl}${urlPath}`,
    pext,
    tags,
  };
};

const parseFolder = async (path, parentPath, coreName) => {
  let relativePath = posixPath(pathModule.relative(parentPath, path));
  const parts = relativePath.split("/");

  const tags = [];
  let pext = false;
  if (parts[0].length > 0) {
    const firstDir = parts[0].toLowerCase();
    if (firstDir == "games") {
      // This is in the relocatable paths. Set 'path' to 'pext' later.
      pext = true;
      if (parts.length > 1 && parts[1].length > 0) {
        // This is a folder specific for this core.
        tags.push(coreName.toLowerCase());
      }
    }
    if (firstDir.startsWith("_")) {
      tags.push(firstDir.slice(1));
    } else {
      tags.push(firstDir);
    }
  }
  return {
    path: relativePath,
    pext,
    tags,
  };
};

const main = async () => {
  const files = [];
  const folders = [];

  for (const core of await getFolders(assetDir)) {
    // This is a core directory, find all of its files and folders
    if (ignoredDirectories.includes(core.name)) {
      continue;
    }

    for await (const [path, entry] of getFilesRecursive(core.path)) {
      if (shouldSkipEntry(path)) {
        continue;
      }

      if (entry.isDirectory()) {
        folders.push(await parseFolder(path, core.path, core.name));
      } else {
        files.push(await parseFile(path, core.path, core.name));
      }
    }
  }

  // Build the manifest
  const manifest = {
    v: 1,
    db_id: dbID,
    timestamp: Math.floor(Date.now() / 1000),
    files: {},
    folders: {},
  };

  for (const { path, hash, size, url, pext, tags } of files) {
    manifest.files[path] = {
      hash,
      size,
      url,
      tags,
      ...(pext ? {"path": "pext"} : {})
    };
  }

  for (const { path, pext, tags } of folders) {
    manifest.folders[path] = {
      tags,
      ...(pext ? {"path": "pext"} : {})
    };
  }

  console.log(manifest);

  console.log("Writing manifest");
  await fs.writeFile("manifest.json", JSON.stringify(manifest));
};

main();
