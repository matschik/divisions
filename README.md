# Divisions 🌿

> Minimalist modular backend development

<p>
  <a href="https://npmjs.com/package/divisions"><img src="https://img.shields.io/npm/v/divisions?style=flat&colorA=18181B&colorB=339933" alt="npm version"></a>
  <a href="https://npmjs.com/package/divisions"><img src="https://img.shields.io/npm/dm/divisions?style=flat&colorA=18181B&colorB=339933" alt="npm downloads"></a>
  <a href="https://github.com/matschik/divisions/blob/main/LICENSE"><img src="https://img.shields.io/github/license/matschik/divisions.svg?style=flat&colorA=18181B&colorB=339933" alt="License"></a>
</p>

Modular Node.js backend development, management, and orchestration of backend applications.

It promotes a clean separation of concerns by structuring applications into distinct functional units, called "divisions".

## Features

- 🧩 **Modular Design**: Clean architectural separation into distinct divisions.
- 🔗 **Dependency Management**: Ensures correct initialization order of divisions.
- ✅ **Environment Variables Validation**: JSON Schema validation for environment variables.
- 🖥 **CLI Integration**: Defines and executes division-specific commands.
- 🍃 **Dynamic Lifecycle Management**: Custom setup and teardown routines for resource management.

## Motivation

In complex applications, managing configurations, dependencies, and initialization order can become challenging.

Divisions was created to address these challenges by offering a structured way to organize application logic into manageable, isolated modules.

This approach not only improves code maintainability but also enhances the development workflow by providing clear interfaces for each part of the application.

Inspired by the modular philosophy, Divisions aims to bring simplicity, clarity, and efficiency to backend application development.

## Getting Started

### Prerequisites

Node.js version 20.11.0 or higher is required.

### Installation

Install `divisions` via npm/yarn/pnpm:

```bash
npm install divisions
```

### Setup

Our goal is to create a division called `http` to create our http server.

1. Create the `divisions` directory. It will contains all our divisions directories.
2. Create your first division directory `divisions/http`.
3. Create `divisions/http/index.js` with the following content:

```js
// divisions/http/index.js
import http from "node:http";

export const meta = {
  // Define environment variables schema for validation
  envSchema: {
    type: "object",
    properties: {
      PORT: { type: "integer" },
    },
    required: ["PORT"],
  },
};

// Define division setup
export function setup({ config }) {
  const httpServer = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Hello from http division 👋");
  });

  return {
    // On start `http` division
    start() {
      httpServer.listen(config.PORT, () => {
        console.info(`HTTP Server running at http://localhost:${config.PORT}`);
      });

      return {
        // Close `http` division in a clean way
        cleanup() {
          httpServer.close();
          console.info("HTTP Server has been closed");
        },
      };
    },
  };
}
```

4. Create a `.env` file at the root of your project containing all environment variables used by our divisions.

```sh
PORT=3000
```

5. Create `index.js` to start divisions. This operation will import your divisions and execute them.

```js
import { startDivisions } from "divisions";

startDivisions().catch(console.error);
```

By the end, your project structure should look like this:

```sh
.
├── divisions
│   └── http
│       └── index.js
├── index.js
├── package.json
```

6. Launch it !

```sh
❯ node index.js
HTTP Server running at http://localhost:3000

❯ curl http://localhost:3000
Hello from http division 👋
```

## Contributing

Contributions are welcome! Submit issues, feature requests, or pull requests 🤝.

## License

Made with 💚

Published under the [MIT](./LICENSE) license.

## Acknowledgements

Inspired by the modular design philosophy and contributions to the open-source Node.js ecosystem by developers worldwide 🙌
