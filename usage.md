# AnyINB — Feature & Usage Guide

## 🌟 6 Groundbreaking Built-In Features

### 1. 🌉 Polyglot Data Piping (`IN` / `$IN`)
Output from any database query (SQL, MongoDB, Redis) or REST API is automatically injected into subsequent cells:
* **Python**: Access previous query output as a Pandas DataFrame:
  ```python
  # IN is already in memory!
  print(f"Total rows received: {len(IN)}")
  print(IN.head())
  ```
* **JavaScript**: Access previous output via `IN`:
  ```javascript
  console.log("First item:", IN[0]);
  ```
* **WSL / Bash**: Access output via `$IN` or `$IN_JSON`:
  ```bash
  echo "$IN" | grep "admin"
  ```

---

### 2. 📸 Time-Machine Data Diff
* When modifying data (`UPDATE`, `DELETE`, or data transformations), AnyINB compares results against your previous query snapshot.
* Click the **`📸 Diff`** tab to visually see:
  * 🟩 **Green (+)**: Newly added rows
  * 🟨 **Yellow**: Fields that changed value
  * 🟥 **Red (-)**: Deleted rows

---

### 3. 🧪 Zero-Install In-Memory Sandbox Mode
* Practice SQL (`CREATE TABLE`, `INSERT`, `SELECT`) and MongoDB (`db.users.insertOne()`, `db.users.find()`) with **zero external database servers or Docker required**.
* Pre-loaded sample databases (`users`, `products`) are available immediately!

---

### 4. ⚡ Smart Query Cost & Index Advisor
* Query results display real-time performance insights in the cell footer:
  * `⚡ Optimal Cost (Index-efficient)`
  * `💡 Tip: Add LIMIT clause to optimize fetch`
  * `⚡ Index Recommendation: idx_<column>`

---

### 5. 🔀 Live Mock REST API Server
* Define instant live endpoints in cells:
  ```javascript
  // @endpoint GET /api/users
  [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" }
  ]
  ```
* Test it from an `http` cell:
  ```http
  GET http://localhost:3456/api/users
  ```

---

### 6. 🎬 Interactive Story & Presentation Mode
* Press `Ctrl+Shift+P` $\rightarrow$ **`AnyINB: Start Presentation / Story Mode`**.
* Presents your notebook step-by-step with an interactive spotlight runner (`▶️ Run & Next`, `⏭️ Skip`, `⏹️ Stop`).
