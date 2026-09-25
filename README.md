# AnyINB 🚀

**AnyINB** is a polyglot interactive notebook extension for Visual Studio Code. Run code, execute live database queries, test HTTP/GraphQL/WebSocket APIs, spawn local mock servers, and pipe data across languages — all within a single unified `.anyinb` notebook workflow.

---

## ✨ Key Features

- **🌐 16+ Programming Languages**: Execute Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Perl, R, Lua, Swift, Kotlin, and Dart with automatic compiler/runtime wrapping.
- **🗄️ Full Database Integration**: Connect to and query **MySQL**, **PostgreSQL**, **SQLite**, **MongoDB** (`mongosh` syntax), and **Redis** directly from cells with live connection management and status bar indicators.
- **🔄 Cross-Cell Data Piping (`DataContext`)**: Seamlessly access the result of previous queries in Python (as `IN` or an auto-detected `pandas` DataFrame), JavaScript (`IN`), and Shell (`$IN` / `$IN_JSON`).
- **🌐 Network & API Tooling**:
  - Direct **HTTP / REST** request cells (`GET`, `POST`, headers, and payloads).
  - **GraphQL** query and mutation executor.
  - Interactive **WebSocket** client (`ws://` and `wss://`).
  - Embedded **Mock REST Server** (`@endpoint GET /path`) to prototype local APIs on the fly.
- **📊 Rich Interactive Output**:
  - Searchable, sortable interactive data tables with column clipping and row numbering.
  - One-click **Copy Table**, **Copy JSON**, and **Copy Text** buttons.
  - Built-in **Matplotlib** and **Seaborn** auto-plotting (plots render directly inline).
- **🎨 8 Terminal & Output Themes**:
  - `mongosh-terminal` (Authentic terminal with green strings)
  - `dracula`
  - `tokyo-night`
  - `monokai`
  - `one-dark`
  - `nord`
  - `github-dark`
  - `solarized-dark`
- **💻 Multi-Shell Execution**: Run scripts in **Bash**, **PowerShell**, **Command Prompt (CMD)**, and **WSL (Linux)**.
- **🎭 Presentation Mode**: Step through cells in a clean, focused presentation view for demos and walkthroughs.
- **🐳 Docker Support**: Optionally run languages inside isolated Docker containers.

---

## 🚀 Getting Started

1. **Install AnyINB** from the VS Code Marketplace or load it into your VS Code extension directory.
2. **Create a notebook**:
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **`AnyINB: New Notebook`**, or
   - Create a file with the `.anyinb` extension (e.g., `analysis.anyinb`).
3. **Select a language** on the bottom right of each cell (e.g. `Python`, `MySQL`, `MongoDB`, `http`, `bash`).
4. **Run the cell** using the Play button or `Shift+Enter`.

---

## 📖 Workflows & Examples

### 1. Database Queries

When a database cell is executed without an active connection, AnyINB displays a one-click connection prompt.

- **MySQL / PostgreSQL / SQLite**: Run standard SQL queries. Results render as interactive tables.
- **MongoDB**: Supports authentic `mongosh` syntax (e.g., `db.users.find({ age: { $gte: 21 } })`, `show dbs`, `use mydb`).
- **Redis**: Execute commands directly (e.g., `SET user:1 "Alice"`, `GET user:1`, `HGETALL cache`).

### 2. Cross-Cell Polyglot Data Piping

Query results from databases or APIs are automatically preserved in the shared `DataContext`:

```sql
-- Cell 1 (MySQL)
SELECT student_id, name, city FROM students WHERE city = 'New York';
```

```python
# Cell 2 (Python) - 'IN' is automatically populated!
# If pandas is installed, IN is already a DataFrame
print(IN.head())
```

```javascript
// Cell 3 (JavaScript) - 'IN' is available as a JSON array
console.log(`Fetched ${IN.length} records`);
```

### 3. HTTP, GraphQL & WebSockets

- **HTTP Requests**:
  ```http
  GET https://jsonplaceholder.typicode.com/todos/1
  Authorization: Bearer token123
  ```
- **GraphQL**:
  ```graphql
  https://countries.trevorblades.com/
  
  query {
    countries {
      code
      name
    }
  }
  ```
- **WebSockets**:
  ```websocket
  wss://echo.websocket.events
  
  {"message": "Hello WebSocket"}
  ```

### 4. Embedded Mock API Server

Turn any notebook cell into an instant live local endpoint:

```
@endpoint GET /api/users
[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]
```

Accessible immediately at `http://localhost:3456/api/users`.

### 5. Python Magics & Shells

- **Python Pip Magics**: `%pip install pandas matplotlib` or `!pip install seaborn` run automatically in your native environment shell.
- **Shells**: Choose `bash`, `powershell`, `cmd`, or `wsl` for system administration tasks.

---

## ⚙️ Configuration Settings

Customize AnyINB in **Settings** (`Ctrl+,` / `Cmd+,` → search `AnyINB`):

| Setting | Default | Description |
|---|---|---|
| `anyinb.outputTheme` | `"mongosh-terminal"` | Visual theme for cell outputs (`mongosh-terminal`, `dracula`, `tokyo-night`, `monokai`, `one-dark`, `nord`, `github-dark`, `solarized-dark`). |
| `anyinb.fontSize` | `13` | Font size in pixels for tables, JSON, and terminal outputs. |
| `anyinb.maxOutputHeight` | `450` | Maximum height in pixels for scrollable output (set `0` for unlimited). |
| `anyinb.enableSearch` | `true` | Show instant live filter/search on tabular query results. |
| `anyinb.enableCopyButtons` | `true` | Show one-click Copy Table / Copy JSON buttons on outputs. |
| `anyinb.pythonAutoPlot` | `true` | Automatically capture and render Matplotlib/Seaborn plots inline. |
| `anyinb.runAllMode` | `"sequential"` | Execution mode for **Run All** (`sequential` for shared state or `concurrent`). |
| `anyinb.useDocker` | `false` | Execute supported language runtimes inside isolated Docker containers. |

---

## ⌨️ Command Palette

| Command | Title |
|---|---|
| `anyinb.newNotebook` | **AnyINB: New Notebook** |
| `anyinb.configureConnection` | **AnyINB: Configure Database Connection** |
| `anyinb.quickConnect` | **AnyINB: Quick Connect to Database** |
| `anyinb.disconnectAll` | **AnyINB: Disconnect All Databases** |
| `anyinb.selectTheme` | **AnyINB: Select Output Color Theme** |
| `anyinb.startPresentation` | **AnyINB: Start Presentation / Story Mode** |

---

## 📄 License

[MIT](LICENSE)

