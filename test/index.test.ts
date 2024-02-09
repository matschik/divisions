import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runDivisionCLI, startDivisions } from "../src/lib/index";

describe("single division operations", () => {
	const divisionsDir = path.join(import.meta.dirname, "divisions1");
	const divisionDir = path.join(divisionsDir, "hello");
	const indexFile = path.join(divisionDir, "index.js");
	const envFile = path.join(import.meta.dirname, ".env.test");

	beforeAll(async () => {
		global.divisions1 = new EventEmitter();
		await fs.mkdir(divisionDir, { recursive: true });

		await fs.writeFile(
			indexFile,
			`
        import { defineCommand, runMain } from "citty";

        export function setup({ config }) {
            return {
                start(){
                    global.divisions1.emit("hello")
                    if(config.PASSWORD){
                        global.divisions1.emit("password", config.PASSWORD)
                    }
                }
            }
        }

        export const meta = {
          envSchema: {
            type: "object",
            properties: {
              PASSWORD: {
                type: "string",
              }
            },
          },
        }

        export function commands() {
          return {
            subCommands: {
              hello: defineCommand({
                meta: {
                  description: "Say hello",
                },
                async run() {
                  console.log("hello");
                },
              }),
            },
          };
        }
    `,
		);

		await fs.writeFile(envFile, "PASSWORD=passwordverysecret");
	});

	afterAll(async () => {
		await fs.rm(divisionsDir, { recursive: true, force: true });
		await fs.rm(envFile);
	});

	test("start is called on start", async () => {
		let isHelloEventReceived = false;
		global.divisions1.once("hello", () => {
			isHelloEventReceived = true;
		});
		const { cleanup } = await startDivisions({
			divisionsPath: divisionsDir,
		});
		cleanup();
		expect(isHelloEventReceived).toBe(true);
	});

	test("get config from environment variable", async () => {
		let password: string | undefined;

		global.divisions1.once("password", (_password: string) => {
			password = _password;
		});
		const { cleanup } = await startDivisions({
			divisionsPath: divisionsDir,
			envPath: envFile,
		});
		cleanup();

		expect(process.env.PASSWORD).toBe("passwordverysecret");
		expect(password).toBe("passwordverysecret");
	});

	// test("cli", async () => {
	//   const { stdout, stderr } = await runDivisionCLI({
	//     divisionsPath: divisionsDir,
	//   });
	//   expect(stdout).toContain("hello");
	//   expect(stderr).toBe("");
	// });
});

// export function commands({ sharedFromSetup }) {
// 	const { server } = sharedFromSetup;

// 	return {
// 		subCommands: {
// 			schema: defineCommand({
// 				meta: {
// 					description: "Print the OpenAPI schema",
// 				},
// 				async run() {
// 					console.info(JSON.stringify(server.getSwaggerJSON(), null, 2));
// 				},
// 			}),
// 		},
// 	};
// }

describe("multiple division operations", () => {
	const divisionsDir = path.join(import.meta.dirname, "divisions2");
	const memorydbIndexFile = path.join(divisionsDir, "memorydb/index.js");
	const helloIndexFile = path.join(divisionsDir, "hello/index.js");

	beforeAll(async () => {
		global.divisions2 = new EventEmitter();

		await fs.mkdir(path.dirname(memorydbIndexFile), { recursive: true });
		await fs.writeFile(
			memorydbIndexFile,
			`
            export function setup() {
                return {
                    shared: {
                        users: [
                            { id: 1, name: "John" },
                            { id: 2, name: "Jane" }
                        ]
                    }
                }
            }
        `,
		);

		await fs.mkdir(path.dirname(helloIndexFile), { recursive: true });
		await fs.writeFile(
			helloIndexFile,
			`
            export const meta = {
                dependsOn: ["memorydb"],
            };

            export function setup() {
                return {
                    start({ shared }) {
                        global.divisions2.emit("users-from-hello", shared.memorydb.users)
                    }
                }
            }
        `,
		);
	});

	afterAll(async () => {
		await fs.rm(divisionsDir, { recursive: true, force: true });
	});

	test("get shared parameter from another division", async () => {
		let users: unknown[];
		global.divisions2.once("users-from-hello", (_users: unknown[]) => {
			users = _users;
		});
		const { cleanup } = await startDivisions({
			divisionsPath: divisionsDir,
		});
		cleanup();
		expect(users).toEqual([
			{ id: 1, name: "John" },
			{ id: 2, name: "Jane" },
		]);
	});
});
