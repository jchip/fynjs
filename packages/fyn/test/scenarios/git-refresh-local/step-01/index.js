const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { repoDir, writeStepPkgJson } = require("../local-repo");

module.exports = {
  title: "should install git dependency from local repo and create cache",
  before(cwd, scenarioDir) {
    console.log(`Step 1 before: cwd=${cwd}, scenarioDir=${scenarioDir}`);
    // Create a local git repository fixture in .tmp (gitignored)
    const gitRepoDir = repoDir(scenarioDir);
    console.log(`Git repo dir: ${gitRepoDir}`);

    // Initialize git repo if it doesn't exist
    if (!fs.existsSync(gitRepoDir)) {
      fs.mkdirSync(gitRepoDir, { recursive: true });
      
      // Create a basic package structure
      const pkgJson = {
        name: "test-from-gh",
        version: "1.0.0",
        main: "src/index.js"
      };
      fs.writeFileSync(
        path.join(gitRepoDir, "package.json"),
        JSON.stringify(pkgJson, null, 2) + "\n"
      );
      
      // Create src/index.js
      const srcDir = path.join(gitRepoDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "index.js"),
        "module.exports = { version: '1.0.0' };\n"
      );
      
      // Create README.md
      fs.writeFileSync(
        path.join(gitRepoDir, "README.md"),
        "# test-from-gh\n\nTest git repository\n"
      );
      
      // Create hello file
      fs.writeFileSync(
        path.join(gitRepoDir, "hello"),
        "world\n"
      );
      
      // Initialize git repo
      execSync("git init", { cwd: gitRepoDir, stdio: "pipe" });
      execSync("git config user.name 'Test User'", { cwd: gitRepoDir, stdio: "pipe" });
      execSync("git config user.email 'test@example.com'", { cwd: gitRepoDir, stdio: "pipe" });
      execSync("git add .", { cwd: gitRepoDir, stdio: "pipe" });
      execSync("git commit -m 'Initial commit'", { cwd: gitRepoDir, stdio: "pipe" });
      execSync("git branch -M main", { cwd: gitRepoDir, stdio: "pipe" });
    }
    
    // The framework merges the step's pkg.json into package.json right after this hook returns,
    // so generate it here rather than committing a machine-specific path.
    const fileUrl = writeStepPkgJson(scenarioDir, "step-01");

    console.log(`Using local git repo: ${fileUrl}`);
  }
};

