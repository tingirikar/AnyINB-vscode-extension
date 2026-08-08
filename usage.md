# AnyINB Usage Guide

Welcome to **AnyINB** (Universal Interactive Notebook)! This guide will walk you through launching the extension locally and testing all of its features.

## 🚀 1. How to Launch and Test Locally

To test the extension on your own machine without publishing it:

1. **Open the project in VS Code:** Make sure you have the `anyinb-vscode-extension` folder open in VS Code.
2. **Install Dependencies:** If you haven't already, run `npm install` in your terminal.
3. **Compile the code:** Run `npm run compile` to build the TypeScript code.
4. **Launch the Extension Host:** Press **`F5`** on your keyboard (or go to the "Run and Debug" view and click the green play button). 
5. A **new VS Code window** will open. This is the "Extension Development Host" where your extension is loaded and ready to be tested!

---

## 🧪 2. Testing the Features

In the new Extension Development Host window that opened, follow these steps to test everything:

### Step A: Configure Databases
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette.
2. Type **`AnyINB: Configure Database Connection`** and select it.
3. You will see a prompt to enter connection URIs for **MySQL, PostgreSQL, SQLite, MongoDB, and Redis**. 
   - *If you don't have these databases running locally, you can skip them and test programming languages/APIs instead.*

### Step B: Create a Notebook
1. Open any folder or workspace in the new VS Code window.
2. Create a new file named **`test.anyinb`**.
3. VS Code will recognize it as an AnyINB Notebook.

### Step C: Test the Cells!

Click **"+ Code"** to add cells. In the bottom right corner of each cell, click the language identifier to change the language. Try the following tests:

#### 1. Persistent REPL (Python or Node.js)
Change the language to `python` or `javascript`.
**Cell 1:**
```python
my_var = "Hello AnyINB"
print("Variable set!")
```
*(Run this cell. Then in the next cell...)*

**Cell 2:**
```python
print(my_var) # It remembers the variable from the previous cell!
```

#### 2. SQL & Data Visualization (requires DB connection)
Change the language to `sqlite` (or `postgres`).
```sql
CREATE TABLE IF NOT EXISTS sales (month VARCHAR(20), revenue INT);
INSERT INTO sales VALUES ('Jan', 500), ('Feb', 800), ('Mar', 1200);
SELECT * FROM sales;
```
*Run the cell. In the output, you will see tabs. Click **📊 Chart** to see a bar chart, or click **⬇️ CSV** to export the table data!*

#### 3. Environment Variables
Create a file named `.env` in your workspace and add:
```
MY_SECRET_KEY=12345ABCD
```
Now, create an `http` cell:
```http
GET https://httpbin.org/headers
Authorization: Bearer {{MY_SECRET_KEY}}
```
*Run it and check the response body — you will see your secret key was injected automatically!*

#### 4. GraphQL
Change the language to `graphql`:
```graphql
POST https://countries.trevorblades.com/

query {
  countries(filter: {continent: {eq: "EU"}}) {
    name
    code
  }
}
```

#### 5. WebSockets
Change the language to `websocket`:
```websocket
ws://echo.websocket.events

Hello from AnyINB!
```
*Wait a moment, and the server will echo your message back!*

#### 6. Docker Execution (Optional)
If you have Docker Desktop installed:
1. Go to VS Code Settings (`Ctrl+,`).
2. Search for **`anyinb.useDocker`** and check the box.
3. Run a Python or Node.js cell. It will now execute securely inside an isolated Docker container!

---

## 🛑 How to Stop / Re-test
- If a cell is stuck in an infinite loop, click the **Stop (Square)** button next to the cell to interrupt it.
- To close the testing environment, just close the Extension Development Host window.
- If you make changes to the extension's code, press `Ctrl+Shift+F5` (Restart) in your main VS Code window to reload the host.
