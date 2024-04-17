import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  CustomError,
  assertHardhatUtilsInvariant,
} from "./errors/custom-errors.js";
import { ensureError } from "./errors/catch-utils.js";

// We use this error to encapsulate any other error possibly thrown by node's
// fs apis, as sometimes their errors don't have stack traces.
export class FileSystemAccessError extends CustomError {}

export class FileNotFoundError extends CustomError {
  constructor(filePath: string, cause?: Error) {
    super(`File ${filePath} not found`, cause);
  }
}

export class FileAlreadyExistsError extends CustomError {
  constructor(filePath: string, cause?: Error) {
    super(`File ${filePath} already exists`, cause);
  }
}

export class InvalidFileFormatError extends CustomError {
  constructor(filePath: string, cause: Error) {
    super(`Invalid file format: ${filePath}`, cause);
  }
}

export class JsonSerializationError extends CustomError {
  constructor(filePath: string, cause: Error) {
    super(`Error serializing JSON file ${filePath}`, cause);
  }
}

export class InvalidDirectoryError extends CustomError {
  constructor(filePath: string, cause: Error) {
    super(`Invalid directory ${filePath}`, cause);
  }
}

/**
 * Determines the canonical pathname for a given path, resolving any symbolic
 * links, and returns it.
 *
 * @throws FileNotFoundError if absolutePath doesn't exist.
 * @throws FileSystemAccessError for any other error.
 */
export async function getRealPath(absolutePath: string): Promise<string> {
  try {
    return await fsPromises.realpath(path.normalize(absolutePath));
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    if (e.code === "ENOENT") {
      throw new FileNotFoundError(absolutePath, e);
    }

    throw new FileSystemAccessError(e.message, e);
  }
}

/**
 * Recursively searches a directory and its subdirectories for files that
 * satisfy the specified condition, returning their absolute paths.
 *
 * @param dirFrom The absolute path of the directory to start the search from.
 * @param matches A function to filter files (not directories).
 * @returns An array of absolute paths. Each file has its true case, except
 *  for the initial dirFrom part, which preserves the given casing.
 *  No order is guaranteed. If dirFrom doesn't exist `[]` is returned.
 * @throws InvalidDirectoryError if dirFrom is not a directory.
 * @throws FileSystemAccessError for any other error.
 */
export async function getAllFilesMatching(
  dirFrom: string,
  matches?: (absolutePathToFile: string) => boolean,
): Promise<string[]> {
  const dirContent = await readdir(dirFrom);

  const results = await Promise.all(
    dirContent.map(async (file) => {
      const absolutePathToFile = path.join(dirFrom, file);
      const stats = await fsPromises.stat(absolutePathToFile);
      if (stats.isDirectory()) {
        return getAllFilesMatching(absolutePathToFile, matches);
      } else if (matches === undefined || matches(absolutePathToFile)) {
        return absolutePathToFile;
      } else {
        return [];
      }
    }),
  );

  return results.flat();
}

/**
 * Determines the true case path of a given relative path from a specified
 * directory, without resolving symbolic links, and returns it.
 *
 * @param from The absolute path of the directory to start the search from.
 * @param relativePath The relative path to get the true case of.
 * @returns The true case of the relative path.
 * @throws FileNotFoundError if the starting directory or the relative path doesn't exist.
 * @throws InvalidDirectoryError if the starting directory is not a directory.
 * @throws FileSystemAccessError for any other error.
 */
export async function getFileTrueCase(
  from: string,
  relativePath: string,
): Promise<string> {
  const dirEntries = await readdir(from);

  const segments = relativePath.split(path.sep);
  const nextDir = segments[0];
  assertHardhatUtilsInvariant(
    nextDir !== undefined,
    "Splitting the path should always return at least one segment.",
  );
  const nextDirLowerCase = nextDir.toLowerCase();

  for (const dirEntry of dirEntries) {
    if (dirEntry.toLowerCase() === nextDirLowerCase) {
      if (segments.length === 1) {
        return dirEntry;
      }

      return path.join(
        dirEntry,
        await getFileTrueCase(
          path.join(from, dirEntry),
          path.relative(nextDir, relativePath),
        ),
      );
    }
  }

  throw new FileNotFoundError(path.join(from, relativePath));
}

/**
 * Checks if a given path is a directory.
 *
 * @param absolutePath The path to check.
 * @returns `true` if the path is a directory, `false` otherwise.
 * @throws FileNotFoundError if the path doesn't exist.
 * @throws FileSystemAccessError for any other error.
 */
export async function isDirectory(absolutePath: string): Promise<boolean> {
  try {
    return (await fsPromises.lstat(absolutePath)).isDirectory();
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    if (e.code === "ENOENT") {
      throw new FileNotFoundError(absolutePath, e);
    }

    throw new FileSystemAccessError(e.message, e);
  }
}

/**
 * Reads a JSON file and parses it. The encoding used is "utf8".
 *
 * @param absolutePathToFile The path to the file.
 * @returns The parsed JSON object.
 * @throws FileNotFoundError if the file doesn't exist.
 * @throws InvalidFileFormatError if the file is not a valid JSON file.
 * @throws FileSystemAccessError for any other error.
 */
export async function readJsonFile<T>(absolutePathToFile: string): Promise<T> {
  const content = await readUtf8File(absolutePathToFile);
  try {
    return JSON.parse(content.toString());
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    throw new InvalidFileFormatError(absolutePathToFile, e);
  }
}

/**
 * Writes an object to a JSON file. The encoding used is "utf8" and the file is overwritten.
 *
 * @param absolutePathToFile The path to the file. If the file exists, it will be overwritten.
 * @param object The object to write.
 * @throws JsonSerializationError if the object can't be serialized to JSON.
 * @throws FileNotFoundError if part of the path doesn't exist.
 * @throws FileSystemAccessError for any other error.
 */
export async function writeJsonFile<T>(absolutePathToFile: string, object: T) {
  let content;
  try {
    content = JSON.stringify(object, null, 2);
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    throw new JsonSerializationError(absolutePathToFile, e);
  }

  await writeUtf8File(absolutePathToFile, content);
}

/**
 * Reads a file and returns its content as a string. The encoding used is "utf8".
 *
 * @param absolutePathToFile The path to the file.
 * @returns The content of the file as a string.
 * @throws FileNotFoundError if the file doesn't exist.
 * @throws FileSystemAccessError for any other error.
 */
export async function readUtf8File(
  absolutePathToFile: string,
): Promise<string> {
  try {
    return await fsPromises.readFile(absolutePathToFile, { encoding: "utf8" });
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    if (e.code === "ENOENT") {
      throw new FileNotFoundError(absolutePathToFile, e);
    }

    throw new FileSystemAccessError(e.message, e);
  }
}

/**
 * Writes a string to a file. The encoding used is "utf8" and the file is overwritten by default.
 *
 * @param absolutePathToFile The path to the file.
 * @param data The data to write.
 * @param flag The flag to use when writing the file. If not provided, the file will be overwritten.
 * See https://nodejs.org/docs/latest-v20.x/api/fs.html#file-system-flags for more information.
 * @throws FileNotFoundError if part of the path doesn't exist.
 * @throws FileAlreadyExistsError if the file already exists and the flag "x" is used.
 * @throws FileSystemAccessError for any other error.
 */
export async function writeUtf8File(
  absolutePathToFile: string,
  data: string,
  flag?: string,
): Promise<void> {
  try {
    await fsPromises.writeFile(absolutePathToFile, data, {
      encoding: "utf8",
      flag,
    });
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    if (e.code === "ENOENT") {
      throw new FileNotFoundError(absolutePathToFile, e);
    }

    // flag "x" has been used and the file already exists
    if (e.code === "EEXIST") {
      throw new FileAlreadyExistsError(absolutePathToFile, e);
    }

    throw new FileSystemAccessError(e.message, e);
  }
}

/**
 * Reads a directory and returns its content as an array of strings. If the directory doesn't exist,
 * an empty array is returned.
 *
 * @param absolutePathToDir The path to the directory.
 * @returns An array of strings with the names of the files and directories in the directory.
 * @throws InvalidDirectoryError if the path is not a directory.
 * @throws FileSystemAccessError for any other error.
 */
export async function readdir(absolutePathToDir: string) {
  try {
    return await fsPromises.readdir(absolutePathToDir);
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    if (e.code === "ENOENT") {
      return []; // TODO this doesn't feel right, we should throw an error
    }

    if (e.code === "ENOTDIR") {
      throw new InvalidDirectoryError(absolutePathToDir, e);
    }

    throw new FileSystemAccessError(e.message, e);
  }
}

/**
 * Creates a directory and any necessary directories along the way. If the directory already exists,
 * nothing is done.
 *
 * @param absolutePath The path to the directory to create.
 * @throws FileSystemAccessError for any error.
 */
export async function mkdir(absolutePath: string): Promise<void> {
  try {
    await fsPromises.mkdir(absolutePath, { recursive: true });
  } catch (e) {
    ensureError<NodeJS.ErrnoException>(e);
    throw new FileSystemAccessError(e.message, e);
  }
}
