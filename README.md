# AnyINB

AnyINB is a VS Code notebook extension for running code, database queries, and lightweight API work in one notebook workflow.

It is designed for small, practical notebook sessions rather than a full multi-tool platform. The current scope is intentionally realistic and focused.

## Included workflows

- Python and JavaScript execution inside notebook cells
- SQL queries for MySQL, PostgreSQL, SQLite, MongoDB, and Redis
- HTTP and GraphQL request cells
- shell execution for Bash, PowerShell, CMD, and WSL
- local in-memory sandbox execution when no external database is connected
- mock endpoint creation for quick API-style experimentation

## Architecture

- notebook lifecycle is handled by the serializer and controller
- each runtime is routed through its own executor
- database connectivity is centralized in the connection manager
- notebook output is rendered in a consistent HTML-based format

## Getting started

1. Open VS Code.
2. Install the extension.
3. Create a new `.anyinb` notebook.
4. Add a code cell and run it with the notebook play button.
5. Configure a database from the command palette if you want live connections instead of sandbox mode.

## Settings

The extension exposes a small set of configuration settings under the AnyINB section, including:

- output theme
- maximum output height
- Python auto-plot behavior
- Docker execution toggle
- Run All execution mode

## Current status

This is a working MVP with a real execution layer behind it. It is suitable for focused notebook workflows, but it is still best treated as a practical prototype rather than a broad enterprise product.

## License

MIT
