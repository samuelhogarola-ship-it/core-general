import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";

const VERSION = "8.30.1";
const PLATFORM_MAP = { darwin: "darwin", linux: "linux" };
const ARCH_MAP = { arm64: "arm64", x64: "x64" };
const platform = PLATFORM_MAP[process.platform];
const arch = ARCH_MAP[process.arch];

if (!platform || !arch) {
  console.error(
    `Unsupported platform for gitleaks install: ${process.platform} ${process.arch}`,
  );
  process.exit(1);
}

const repoRoot = process.cwd();
const toolsRoot = path.join(repoRoot, ".tools", "gitleaks");
const versionRoot = path.join(toolsRoot, VERSION);
const currentLink = path.join(toolsRoot, "current");
const binaryPath = path.join(versionRoot, "gitleaks");

if (existsSync(binaryPath)) {
  console.log(`gitleaks ${VERSION} already installed at ${binaryPath}`);
  process.exit(0);
}

mkdirSync(versionRoot, { recursive: true });
const archiveName = `gitleaks_${VERSION}_${platform}_${arch}.tar.gz`;
const downloadUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${archiveName}`;
const archivePath = path.join(tmpdir(), archiveName);

console.log(`Downloading ${downloadUrl}`);
execFileSync("curl", ["-L", "-o", archivePath, downloadUrl], {
  stdio: "inherit",
});
console.log(`Extracting ${archiveName}`);
execFileSync("tar", ["-xzf", archivePath, "-C", versionRoot], {
  stdio: "inherit",
});
chmodSync(binaryPath, 0o755);

try {
  rmSync(currentLink, { recursive: true, force: true });
} catch {
  // Ignore missing previous symlink.
}

symlinkSync(versionRoot, currentLink, "dir");
console.log(`Installed gitleaks ${VERSION} to ${binaryPath}`);
