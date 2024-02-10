import fs from "node:fs/promises";
import { packageDirectory } from "pkg-dir";
import cp from "node:child_process";
import util from "node:util";

export async function getGitRepositoryPath() {
  const exec = util.promisify(cp.exec);

  async function getGitRepositoryPath() {
    let repositoryPath = "";
    try {
      const { stdout } = await exec("git rev-parse --show-toplevel");
      repositoryPath = stdout.trim();
    } catch (error) {
      console.error(error);
    }
    return repositoryPath;
  }

  getGitRepositoryPath();
}

export async function getDivisionsLibPkgJson() {
  const divisionsLibDirectory = await getDivisionsLibDirectory();
  const pkgJsonPath = `${divisionsLibDirectory}/package.json`;
  const pkgJson = await fs.readFile(pkgJsonPath, "utf-8");
  return JSON.parse(pkgJson);
}

export async function getProjectDirectoryPkgJson() {
  const projectDirectory = await getProjectDirectory();
  const pkgJsonPath = `${projectDirectory}/package.json`;
  const pkgJson = await fs.readFile(pkgJsonPath, "utf-8");
  return JSON.parse(pkgJson);
}

export async function getDivisionsLibDirectory() {
  const pkgDirPath = await packageDirectory({
    cwd: import.meta.dirname,
  });
  return pkgDirPath;
}

export async function getProjectDirectory() {
  const pkgDirPath = await packageDirectory();
  return pkgDirPath;
}

export async function getDivisionsDirectory() {
  const pkgDirPath = await packageDirectory();
  const divisionsDirPath = `${pkgDirPath}/divisions`;
  return divisionsDirPath;
}
