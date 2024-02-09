import fs from "node:fs/promises";
import { packageDirectory } from "pkg-dir";

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
