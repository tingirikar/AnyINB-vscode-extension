# 🚀 AnyINB — The Universal Polyglot Notebook for VS Code

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://marketplace.visualstudio.com)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.80.0-blueviolet.svg)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-win%20|%20mac%20|%20linux%20|%20WSL-lightgrey.svg)](https://github.com)

**AnyINB** (`.anyinb`) is the direct multi-language successor to Jupyter (`.ipynb`). It combines the authentic Jupyter notebook experience (stateful REPLs, inline Matplotlib/Seaborn plots, monospace text streams, and `%pip` magics) with **true polyglot execution** across **15+ programming languages, databases, shells, and APIs** in the exact same notebook file.

---

## 🌟 Key Highlights

### 🎨 Pure `.ipynb` Native Aesthetics (Zero AI Slop)
- **100% Transparent Canvas**: Outputs sit directly on your editor canvas without artificial bounding boxes, nested dark cards, or cluttered borders.
- **Pure Syntax Theming**: Themes (*Terminal, Dracula, Monokai, Tokyo Night, Nord*) customize the **syntax highlight colors** of your query and JSON outputs without adding heavy backgrounds.
- **Native Inline Visualizations**: Matplotlib and Seaborn plots render directly as crisp, high-resolution inline PNGs with full zoom, copy, and save support.

### 🧬 Everything You Love from Jupyter `.ipynb`
- **Stateful REPL Variables**: Variables and imports declared in Cell 1 (`x = 10`, `df = ...`) stay alive in Cell 2 and Cell 3 (Python & Node.js).
- **Jupyter Magic Commands**: Install packages on the fly with `%pip install <package>` or `!pip install <package>`.
- **Interactive User Input**: Interactive `input()`, `cin >> n`, and `scanf()` prompts with seamless native input dialogs.
- **Non-Blocking Plotting**: Run `plt.show()` without desktop GUI freezes or 30-second timeouts.

### ⚡ Groundbreaking Polyglot Superpowers
- **🌉 Cross-Language Data Piping (`IN` / `$IN`)**: Query MongoDB or SQL in Cell 1 $\rightarrow$ Python in Cell 2 automatically has `IN` as a **Pandas DataFrame** $\rightarrow$ WSL/Bash in Cell 3 has `$IN_JSON`.
- **🪄 Smart Language Auto-Detection**: Pasted Java code into a C++ cell? AnyINB recognizes `public class ... System.out.println`, automatically flips the language tag to `Java`, and executes it with `javac` with zero errors.
- **🧪 Zero-Install Sandbox Mode**: Practice SQL (`CREATE TABLE`, `SELECT`) and MongoDB (`use ecommerce`, `db.users.find()`) in-memory with **0 database servers or Docker installed**.
- **🔀 Live Mock REST API Server**: Add `// @endpoint GET /api/users` above any JSON array to spawn an instant local micro-server for testing webhooks and frontend requests.
- **🎬 Interactive Presentation & Story Mode**: Step through your notebook with an interactive spotlight runner (`AnyINB: Start Presentation / Story Mode`).
- **🐳 Docker Isolation**: Enable `anyinb.useDocker` in settings to run Python, Node.js, or Bash scripts securely inside isolated Docker containers.

---

## 💻 Architecture

```mermaid
graph TD
    User([User / AnyINB Notebook]) -->|Executes Cell| Controller[AnyInbController]
    Controller -->|Smart Auto-Detection| Router{Language Router}
    
    Router -->|Python, Node.js, Bash| REPL[ReplExecutor<br/>Persistent Scope]
    Router -->|C, C++, Java, Rust, Go, C#| Process[Process & Shell Executors<br/>Native Toolchain]
    Router -->|MongoDB, MySQL, Postgres, SQLite, Redis| DB[ConnectionManager / Sandbox<br/>Databases & Caches]
    Router -->|HTTP / REST, GraphQL, WebSocket| API[Web / API Executors]
    
    REPL -.->|Optional| Docker[(Docker Containers)]
    DB -.->|Polyglot Piping| DataCtx[DataContext - IN / $IN]
    DataCtx -.->|Auto-Inject DataFrame| REPL
    
    REPL --> Stream([Native Stdout / Stderr / PNG Stream])
    Process --> Stream
    DB --> HTML[HtmlRenderer - Syntax Theming]
    API --> HTML
    
    Stream --> Output([Notebook Cell Output])
    HTML --> Output
```

---

## 🛠️ Supported Languages & Runtimes

| Category | Supported Languages / Technologies | Key Capabilities |
| :--- | :--- | :--- |
| **Data & Scripting** | Python (`python`), JavaScript (`javascript`), TypeScript (`typescript`) | Persistent REPL, Inline Matplotlib/Seaborn plots, `%pip` magics, Polyglot `IN` DataFrame |
| **Compiled Languages** | C (`gcc`), C++ (`g++`), Java (`javac`), Rust (`cargo` / `rustc`), Go (`go run`), C# (`dotnet`) | Instant compilation, interactive `cin` / `scanf` input, smart auto-detection |
| **Databases & Caches** | MongoDB (`mongosh`), PostgreSQL, MySQL / MariaDB, SQLite, Redis | `show dbs`, `show collections`, `use <db>`, in-memory Sandbox fallback, syntax-highlighted documents |
| **Shells & OS** | Windows Command Prompt (`cmd`), PowerShell (`powershell`), Bash (`bash`), WSL (`wsl`) | Batch scripts, environment piping `$IN_JSON`, system diagnostics |
| **APIs & Web** | HTTP / REST (`http`), GraphQL (`graphql`), WebSockets (`websocket`) | `.env` variable interpolation (`{{API_KEY}}`), Live Mock Server (`@endpoint`) |

---

## 🚀 Getting Started

1. **Install AnyINB** from the VS Code Extensions Marketplace.
2. **Create a Notebook**: Create a new file ending in `.anyinb` (e.g. `analysis.anyinb`).
3. **Add Cells**: Click **`+ Code`** or **`+ Markdown`**.
4. **Run Code**: Write your code and press `Shift+Enter` or click the **Play (▶️)** button.
5. **Connect to Databases (Optional)**: Press `Ctrl+Shift+P` $\rightarrow$ **`AnyINB: Configure Database Connection`** to connect to live MongoDB, Postgres, MySQL, or Redis instances. *(If not connected, AnyINB will automatically run queries in Sandbox Mode!)*

---

## ⚙️ Configuration Settings

Customize AnyINB in VS Code Settings (`Ctrl+,` $\rightarrow$ search `AnyINB`):

| Setting | Default | Description |
| :--- | :--- | :--- |
| `anyinb.outputTheme` | `mongosh-terminal` | Theme for syntax-highlighted outputs (`mongosh-terminal`, `dracula`, `tokyo-night`, `monokai`, `one-dark`, `nord`, `github-dark`, `solarized-dark`). |
| `anyinb.maxOutputHeight` | `450` | Maximum height (in pixels) for long query/document outputs before scrolling. |
| `anyinb.pythonAutoPlot` | `true` | Automatically capture and render Matplotlib/Seaborn figures inline as PNGs. |
| `anyinb.useDocker` | `false` | Run Python, Node.js, and Bash cells inside isolated Docker containers. |
| `anyinb.useSandboxIfDisconnected` | `true` | Automatically fall back to built-in in-memory SQLite/MongoDB when no external database is connected. |

---

## 📄 License

MIT © [AnyINB Contributors](LICENSE)
