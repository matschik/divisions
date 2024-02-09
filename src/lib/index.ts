import Ajv from "ajv";
import type { CommandDef } from "citty";
import { defineCommand, runMain } from "citty";
import dotenv from "dotenv";
import type { JSONSchema7 } from "json-schema";
import fs from "node:fs/promises";
import { getDivisionsDirectory } from "./divisionsPath";

type DivisionsOptions = {
  envPath?: string;
  divisionsPath?: string;
};

type DivisionMeta = {
  envSchema?: JSONSchema7;
  dependsOn?: string[];
};

type DivisionSetup = (
  param: DivisionSetupParam,
) => Promise<DivisionSetupResult>;

type DivisionInfo = {
  name: string;
  rootPath: string;
  hasMeta: boolean;
  meta: DivisionMeta;
  hasSetup: boolean;
  setup: DivisionSetup;
  hasCommands: boolean;
  commands?: (param?: {
    shared?: DivisionShared;
    sharedFromSetup?: DivisionShared;
  }) => CommandDef;
  config?: Record<string, string>;
};

type DivisionShared = Record<string, unknown>;

interface DivisionSetupParam {
  name: string;
  config?: Record<string, string>; // Same as above, specify further if possible
  shared: DivisionShared;
  divisionPath: string;
}

type DivisionStart = (
  param: DivisionStartParam,
) => Promise<DivisionStartResult>;

interface DivisionSetupResult {
  shared?: DivisionShared;
  start?: DivisionStart;
}

interface DivisionStartParam {
  shared?: DivisionShared;
}

interface DivisionStartResult {
  cleanup?: () => Promise<void>;
  shared?: DivisionShared;
}

const metaSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    envSchema: {
      type: "object",
      additionalProperties: true,
      description: "A JSON schema for the .env configuration.",
    },
    dependsOn: {
      type: "array",
      items: {
        type: "string",
      },
      description: "An array of strings representing dependencies.",
    },
  },
  additionalProperties: false,
};

export async function createDivisions(options: DivisionsOptions = {}) {
  const divisionsDirPath =
    options.divisionsPath || (await getDivisionsDirectory());
  const divisionNames = await fs.readdir(divisionsDirPath);
  const divisionMap = new Map<string, DivisionInfo>();

  for (const divisionName of divisionNames) {
    const divisionRootPath = `${divisionsDirPath}/${divisionName}`;
    const indexJsPath = `${divisionRootPath}/index.js`;
    const indexJsPathExists = await pathExists(indexJsPath);

    if (indexJsPathExists) {
      const importedModule = await import(indexJsPath);
      const hasMeta =
        Boolean(importedModule?.meta) &&
        typeof importedModule.meta === "object";
      const meta = importedModule?.meta;
      if (hasMeta) {
        const ajv = new Ajv();
        const validate = ajv.compile(metaSchema);

        if (!validate(meta)) {
          console.error(validate.errors);
          throw new Error(`Division ${divisionName}: Invalid meta`);
        }
      }

      const hasCommands =
        Boolean(importedModule?.commands) &&
        typeof importedModule.commands === "function";

      const commands = importedModule?.commands;
      divisionMap.set(divisionName, {
        name: divisionName,
        rootPath: divisionRootPath,
        hasMeta,
        meta,
        hasSetup:
          Boolean(importedModule?.setup) &&
          typeof importedModule.setup === "function",
        setup: importedModule?.setup,
        hasCommands,
        commands,
      });
    }
  }

  // get config by division
  {
    const envSchemas: JSONSchema7[] = [];
    const divisionEnvKeysMap = new Map<string, string[]>();

    for (const [divisionName, division] of Array.from(
      divisionMap.entries(),
    ).filter(([_, division]) => division.hasMeta)) {
      const { envSchema } = division.meta;
      if (envSchema?.properties) {
        divisionEnvKeysMap.set(divisionName, Object.keys(envSchema.properties));
        envSchemas.push(envSchema);
      }
    }

    if (envSchemas.length > 0) {
      const config = getDotenvAndValidate(
        {
          allOf: envSchemas,
        },
        {
          envPath: options.envPath,
        },
      );

      for (const [
        divisionName,
        divisionEnvKeys,
      ] of divisionEnvKeysMap.entries()) {
        const currentDivisionConfig: { [envKey: string]: string } = {};
        for (const key of divisionEnvKeys) {
          currentDivisionConfig[key] = config[key];
        }

        const division = divisionMap.get(divisionName);
        if (division) {
          divisionMap.set(divisionName, {
            ...division,
            config: Object.freeze(currentDivisionConfig),
          });
        }
      }
    }
  }

  // sort divisionMap by dependsOn
  {
    const sortedDivisionByDependsOn = sortModules(
      Array.from(divisionMap.values()).map((division) => ({
        name: division.name,
        dependsOn: division.meta?.dependsOn || [],
      })),
    );

    const sortedDivisionMap = new Map<string, DivisionInfo>();

    for (const { name } of sortedDivisionByDependsOn) {
      const division = divisionMap.get(name);
      if (division) {
        sortedDivisionMap.set(division.name, division);
      }
    }

    // Clear the original map and repopulate it with sorted entries
    divisionMap.clear();
    for (const [name, division] of sortedDivisionMap) {
      divisionMap.set(name, division);
    }
  }

  async function setupAll() {
    const divisionNameAndSharedMap = new Map<string, DivisionShared>();
    const divisionNameAndSetupParamMap = new Map<
      string,
      Readonly<DivisionSetupParam>
    >();
    const sortedDivisions = Array.from(divisionMap.values());
    const divisionNameAndStartMap = new Map<string, DivisionStart>();

    for (const division of sortedDivisions.filter((d) => d.hasSetup)) {
      const shared = getSharedForDivision(division);

      const setupParam: DivisionSetupParam = Object.freeze({
        name: division.name,
        config: division.config,
        shared,
        divisionPath: division.rootPath,
      });
      divisionNameAndSetupParamMap.set(division.name, setupParam);

      const setupResult = await division.setup(setupParam);

      if (setupResult?.shared) {
        divisionNameAndSharedMap.set(division.name, setupResult.shared);
      }

      if (setupResult?.start) {
        divisionNameAndStartMap.set(division.name, setupResult.start);
      }
    }

    function getSharedForDivision(division: DivisionInfo) {
      let shared = {};
      if (division.hasMeta) {
        const { dependsOn } = division.meta;
        if (Array.isArray(dependsOn) && dependsOn.length > 0) {
          shared = dependsOn.reduce<DivisionShared>((acc, divisionName) => {
            const shared = divisionNameAndSharedMap.get(divisionName);
            if (shared) {
              acc[divisionName] = shared;
            }

            return acc;
          }, {});
        }
      }
      return shared;
    }

    async function startAll() {
      const cleanups: (() => void)[] = [];

      for (const [divisionName, start] of divisionNameAndStartMap.entries()) {
        const division = divisionMap.get(divisionName);
        if (!division) {
          throw new Error(`Division ${divisionName} not found`);
        }
        const shared = getSharedForDivision(division);

        const startResult = await start({
          shared,
        });

        if (startResult?.cleanup) {
          if (typeof startResult.cleanup !== "function") {
            throw new Error(
              `Division ${divisionName}: "cleanup" musts return a function`,
            );
          }
          cleanups.push(startResult.cleanup);
        }
        if (startResult?.shared) {
          divisionNameAndSharedMap.set(divisionName, {
            ...(divisionNameAndSharedMap.get(divisionName) || {}),
            ...startResult.shared,
          });
        }
      }

      return async function cleanupAll() {
        for (const cleanup of cleanups) {
          await cleanup();
        }
      };
    }

    return { divisionNameAndSetupParamMap, startAll, divisionNameAndSharedMap };
  }

  async function getCommandsByDivision() {
    const { divisionNameAndSetupParamMap, divisionNameAndSharedMap } =
      await setupAll();
    const commandsByDivision = new Map();

    for (const [divisionName, division] of Array.from(
      divisionMap.entries(),
    ).filter(([_, division]) => division.hasCommands)) {
      const setupParam = divisionNameAndSetupParamMap.get(divisionName);
      if (!setupParam) {
        throw new Error(`Division ${divisionName} has no setup param`);
      }
      if (!division.commands) {
        throw new Error(`Division ${divisionName} has no commands`);
      }
      const commandConfig = await division.commands({
        ...setupParam,
        sharedFromSetup: divisionNameAndSharedMap.get(divisionName),
      });

      if (!commandConfig.meta) {
        commandConfig.meta = {};
      }

      if (commandConfig.meta instanceof Promise) {
        commandConfig.meta = await commandConfig.meta;
      }

      if (typeof commandConfig.meta === "object" && !commandConfig.meta.name) {
        commandConfig.meta.name = divisionName;
      }
      if (
        typeof commandConfig.meta === "object" &&
        !commandConfig.meta.description
      ) {
        commandConfig.meta.description = `Commands from ${divisionName} division`;
      }
      commandsByDivision.set(divisionName, commandConfig);
    }

    return { commandsByDivision };
  }

  return {
    divisionMap,
    setupAll,
    getCommandsByDivision,
    async start() {
      const { startAll } = await setupAll();
      const cleanupAll = await startAll();

      return async function cleanup() {
        await cleanupAll();
      };
    },
  };
}

export async function startDivisions(options: DivisionsOptions = {}) {
  const { divisionMap, start } = await createDivisions(options);
  const cleanup = await start();

  function closeGracefully(signal: string) {
    cleanup().finally(() => {
      process.kill(process.pid, signal);
    });
  }
  process.once("SIGINT", closeGracefully);
  process.once("SIGTERM", closeGracefully);

  return { divisionMap, cleanup };
}

interface CommandsRecord {
  [commandName: string]: ReturnType<typeof defineCommand>;
}

export async function runDivisionCLI(options: DivisionsOptions = {}) {
  const { getCommandsByDivision } = await createDivisions(options);

  const { commandsByDivision } = await getCommandsByDivision();

  const subCommands = [...commandsByDivision.entries()].reduce<CommandsRecord>(
    (acc, [_divisionName, commandConfig]) => {
      acc[commandConfig.meta.name] = defineCommand(commandConfig);
      return acc;
    },
    {},
  );

  runMain(
    defineCommand({
      meta: {
        name: "div",
        description: "Commands exposed by each division",
      },
      subCommands,
    }),
  );
}

function getDotenvAndValidate(
  schema: JSONSchema7,
  options: DivisionsOptions = {},
) {
  const envKeysSet = new Set<string>();
  if (Array.isArray(schema.allOf)) {
    for (const divisionSchema of schema.allOf) {
      if (typeof divisionSchema === "object" && divisionSchema.properties) {
        for (const key of Object.keys(divisionSchema.properties)) {
          envKeysSet.add(key);
        }
      }
    }
  }

  dotenv.config(
    typeof options.envPath === "string" ? { path: options.envPath } : {},
  );

  const divisionEnv = [...envKeysSet].reduce<Record<string, string>>(
    (acc, envKey) => {
      const value = process.env[envKey];
      if (value) {
        acc[envKey] = value;
      }
      return acc;
    },
    {},
  );

  const ajv = new Ajv({ coerceTypes: true, allErrors: true });
  const validate = ajv.compile(schema);
  const config = structuredClone(divisionEnv);
  const valid = validate(config);

  if (!valid) {
    console.error(validate.errors);
    throw new Error("Invalid env");
  }

  return config;
}

async function pathExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

type SimpleModule = {
  name: string;
  dependsOn: string[];
};

function sortModules(modules: SimpleModule[]): SimpleModule[] {
  const sorted: SimpleModule[] = [];
  const visited = new Set();
  const temporary = new Set();

  function visit(module: SimpleModule, stack: string[]) {
    if (visited.has(module.name)) {
      return;
    }

    if (temporary.has(module.name)) {
      throw new Error(
        `Circular dependency detected: ${stack.join(" -> ")} -> ${module.name}`,
      );
    }

    temporary.add(module.name);
    stack.push(module.name);

    if (module.dependsOn) {
      for (const dependency of module.dependsOn) {
        const depModule = modules.find((m) => m.name === dependency);
        if (depModule) {
          visit(depModule, stack);
        }
      }
    }

    visited.add(module.name);
    temporary.delete(module.name);
    stack.pop();

    sorted.push(module);
  }

  for (const module of modules) {
    if (!visited.has(module.name)) {
      visit(module, []);
    }
  }

  return sorted;
}
