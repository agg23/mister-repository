const process = require("process");
const crypto = require("crypto");
const pathModule = require("path");
const fs = require("fs").promises;

const dbID = "agg23_db";

const ignoredDirectories = [".git", ".github"];

const assetDir = pathModule.resolve(process.argv[2]);
const baseUrl = process.argv[3];

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

  return false;
};

const posixPath = (path) =>
  path.split(pathModule.sep).join(pathModule.posix.sep);

const parseFile = async (path, parentPath) => {
  const file = await fs.readFile(path);
  const hash = md5Hash(file);

  const relativePath = posixPath(pathModule.relative(parentPath, path));
  const urlPath = posixPath(pathModule.relative(assetDir, path));

  return {
    path: relativePath,
    hash,
    size: file.length,
    url: `${baseUrl}${urlPath}`,
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
        const relativePath = posixPath(pathModule.relative(core.path, path));
        folders.push(relativePath);
      } else {
        files.push(await parseFile(path, core.path));
      }
    }
  }

  // Build the manifest
  const manifest = {
    db_id: dbID,
    timestamp: Math.floor(Date.now() / 1000),
    files: {},
    folders: {},
  };

  for (const { path, hash, size, url } of files) {
    manifest.files[`|${path}`] = {
      hash,
      size,
      url,
    };
  }

  for (const folder of folders) {
    manifest.folders[`|${folder}`] = {};
  }

  console.log(manifest);

  console.log("Writing manifest");
  await fs.writeFile("manifest.json", JSON.stringify(manifest));
};

main();
