# 📓 Query Practice Notebook

> **Interactive notebook for practicing MongoDB and MySQL queries — like Jupyter, but for databases.**

Write your database queries in code cells, hit ▶️ Run, and see results rendered as beautiful tables — all without leaving VS Code.

## ✨ Features

- 🔲 **Notebook cells** — Just like Jupyter! Write queries in blocks, run them individually
- 🐬 **MySQL support** — Full SQL query execution with table output
- 🍃 **MongoDB support** — Run JavaScript/MongoDB queries with JSON output
- 📝 **Markdown cells** — Document your queries with rich markdown
- 💾 **Persistent** — Save and reload your query notebooks (`.iqnb` files)
- 🎨 **Beautiful output** — Results rendered as styled HTML tables with row counts and timing
- 🔒 **Secure** — Passwords stored in VS Code's SecretStorage

## 🚀 Quick Start

### 1. Install the Extension
Press `F5` to launch the Extension Development Host (for development).

### 2. Create a Notebook
- Command Palette (`Ctrl+Shift+P`) → **Query Notebook: New Query Notebook**
- Or create a file with the `.iqnb` extension

### 3. Connect to Your Database
- Command Palette → **Query Notebook: Configure Database Connection**
- Choose MySQL or MongoDB and enter your connection details

### 4. Write & Run Queries!
- Set cell language to `SQL` for MySQL queries
- Set cell language to `JavaScript` for MongoDB queries
- Click ▶️ to run a cell

## 📂 File Format

Query notebooks use the `.iqnb` extension. The file is JSON-based:

```json
{
  "cells": [
    {
      "kind": "markdown",
      "language": "markdown",
      "value": "# My Notes"
    },
    {
      "kind": "code",
      "language": "sql",
      "value": "SELECT * FROM users;"
    },
    {
      "kind": "code",
      "language": "javascript",
      "value": "db.collection('users').find({}).toArray()"
    }
  ]
}
```

## 🐬 MySQL Usage

Write standard SQL in cells with language set to `sql`:

```sql
-- DDL
CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));

-- DML
INSERT INTO users VALUES (1, 'Alice');

-- Queries
SELECT * FROM users WHERE name LIKE 'A%';

-- Aggregation
SELECT department, COUNT(*) FROM employees GROUP BY department;
```

## 🍃 MongoDB Usage

Write JavaScript in cells with language set to `javascript`. The `db` object is pre-configured to point to your connected database:

```javascript
// Find documents
db.collection('users').find({ age: { $gte: 21 } }).toArray()

// Insert
db.collection('users').insertOne({ name: 'Alice', age: 28 })

// Aggregate
db.collection('orders').aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
]).toArray()

// Use MongoDB BSON types
const { ObjectId } = require('mongodb');
db.collection('users').findOne({ _id: new ObjectId('...') })
```

## ⚡ Commands

| Command | Description |
|---------|-------------|
| `Query Notebook: New Query Notebook` | Create a new `.iqnb` notebook |
| `Query Notebook: Configure Database Connection` | Set up MySQL or MongoDB connection |
| `Query Notebook: Disconnect All Databases` | Close all database connections |

## 🛠️ Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Launch in VS Code (press F5)
```

## 📋 Prerequisites

- **MySQL**: Have a MySQL server running (locally or remote)
- **MongoDB**: Have a MongoDB server running (locally or remote)
- **VS Code**: Version 1.80.0 or higher

## 📄 License

MIT
