import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verify } from "run-verify";

const execFileAsync = promisify(execFile);
const moduleUrl = new URL("../src/meta-memoizer.ts", import.meta.url).href;
const run = (script: string) => execFileAsync(process.execPath, [
  "--input-type=module",
  "--eval",
  `import { startMetaMemoizer } from ${JSON.stringify(moduleUrl)};\n${script}`,
], { timeout: 3000, env: { ...process.env, FORCE_COLOR: "1" } });

describe("metadata memoizer lifecycle", () => {
  it("does not keep a completed command alive", () =>
    verify({ timeout: 5000 })
      .step(() => run(`
        const server = await startMetaMemoizer();
        console.log(String(server.info.port));
      `))
      .step(({ stdout }) => {
        expect(Number(stdout.trim())).toBeGreaterThan(0);
      }));

  it("serves metadata while command work is active, then exits naturally", () =>
    verify({ timeout: 5000 })
      .step(() => run(`
        import http from "node:http";
        const server = await startMetaMemoizer();
        const request = method => new Promise((resolve, reject) => {
          const req = http.request({
            hostname: "localhost", port: server.info.port,
            path: "/?key=package", method, agent: false,
          }, res => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", chunk => body += chunk);
            res.on("end", () => resolve({ status: res.statusCode, ...JSON.parse(body) }));
          });
          req.on("error", reject);
          req.end();
        });
        // Ongoing command work holds the process open before any requests exist.
        await new Promise(resolve => setTimeout(resolve, 20));
        const posted = await request("POST");
        const fetched = await request("GET");
        console.log(JSON.stringify({ posted, fetched }));
      `))
      .step(({ stdout }) => {
        const { posted, fetched } = JSON.parse(stdout);
        expect(posted.status).toBe(200);
        expect(posted.time).toBeGreaterThan(0);
        expect(fetched).toEqual(posted);
      }));
});
