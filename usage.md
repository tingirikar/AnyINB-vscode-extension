# AnyINB usage notes

This document describes the actual supported notebook workflows and intended usage patterns.

## Basic notebook flow

1. Create a `.anyinb` notebook.
2. Choose the cell language you want to use.
3. Run the cell with the notebook play button.
4. Use the command palette when you need connection setup or output theme changes.

## Python and JavaScript

The extension keeps persistent REPL-style state for Python and JavaScript so values can be reused across cells in the same notebook session.

## SQL and database queries

Supported database types include:

- MySQL
- PostgreSQL
- SQLite
- MongoDB
- Redis

When a query cell is executed without an active connection, AnyINB displays a connection prompt so you can connect directly to your live database server.

## Shell commands

Shell execution is supported for:

- Bash
- PowerShell
- CMD
- WSL

## HTTP and GraphQL

Request-style cells can be used for direct HTTP calls and GraphQL payloads.

## Mock API testing

The notebook can expose a simple local mock endpoint for lightweight API experimentation.

## Data context

Result sets are stored in the local data context so later cells can build on recent results for simple exploratory flows.

## Presentation mode

The notebook also includes a simple step-through mode for demos or guided walkthroughs.

## Current project status

This is a working MVP with real execution support for the above flows. It is intentionally scoped and documented as a practical notebook tool rather than a broad platform.
