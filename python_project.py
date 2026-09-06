import http.server
import json
import os
import socket
import sys
import urllib.parse
import webbrowser
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "expenses.json")
BACKUP_FILE = os.path.join(BASE_DIR, "expenses.backup.json")
USERS_FILE = os.path.join(BASE_DIR, "users.json")


def load_expenses():
    """Load existing expenses from the JSON file."""
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_expenses(expenses):
    """Save the list of expenses back to the JSON file."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(expenses, f, indent=2)


def load_users():
    """Load users dictionary from users.json.
    If users.json does not exist, initialize it by migrating existing expenses
    into a default 'anoop' user account (password: '1234') to guarantee zero data loss.
    """
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                users = json.load(f)
                if isinstance(users, dict) and len(users) > 0:
                    return users
        except Exception:
            pass

    # Auto-migration: preserve all legacy expenses for user 'anoop'
    legacy_expenses = load_expenses()
    users = {
        "anoop": {
            "password": "1234",
            "created_at": datetime.now().isoformat(),
            "expenses": legacy_expenses,
        }
    }
    save_users(users)
    return users


def save_users(users):
    """Save users dictionary to users.json and keep expenses.json synchronized for anoop."""
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)

    # Sync primary user 'anoop' back to expenses.json for backward compatibility
    if "anoop" in users and isinstance(users["anoop"].get("expenses"), list):
        save_expenses(users["anoop"]["expenses"])


# =====================================================================
# CLI Functions (Preserved with Multi-User Awareness)
# =====================================================================

def get_cli_user(users):
    """Get active user for CLI operations (defaulting to anoop)."""
    if "anoop" in users:
        return "anoop"
    return list(users.keys())[0] if users else "anoop"


def add_expense_cli(user_name):
    users = load_users()
    if user_name not in users:
        users[user_name] = {"password": "1234", "created_at": datetime.now().isoformat(), "expenses": []}

    expenses = users[user_name]["expenses"]
    print(f"\n--- Add Expense for [{user_name}] ---")
    date_input = input("Date (YYYY-MM-DD) [press Enter for today]: ").strip()
    if date_input == "":
        date = datetime.today().strftime("%Y-%m-%d")
    else:
        try:
            datetime.strptime(date_input, "%Y-%m-%d")
            date = date_input
        except ValueError:
            print("Invalid date format. Using today's date instead.")
            date = datetime.today().strftime("%Y-%m-%d")

    category = input("Category (e.g. Food, Travel, Rent): ").strip().title()
    if category == "":
        category = "Uncategorized"

    while True:
        amount_input = input("Amount: ").strip()
        try:
            amount = float(amount_input)
            if amount <= 0:
                print("Amount must be greater than 0.")
                continue
            break
        except ValueError:
            print("Please enter a valid number.")

    note = input("Note (optional): ").strip()

    expense = {
        "date": date,
        "category": category,
        "amount": round(amount, 2),
        "note": note,
    }
    expenses.append(expense)
    save_users(users)
    print(f"Added: {category} - ₹{amount:.2f} on {date} (Saved to {user_name}'s profile)")


def view_expenses_cli(user_name):
    users = load_users()
    expenses = users.get(user_name, {}).get("expenses", [])

    print(f"\n--- All Expenses for [{user_name}] ---")
    if not expenses:
        print(f"No expenses recorded yet for {user_name}.")
        return

    sorted_expenses = sorted(expenses, key=lambda e: e.get("date", ""))

    print(f"{'#':<4}{'Date':<12}{'Category':<18}{'Amount':<10}Note")
    print("-" * 60)
    for i, e in enumerate(sorted_expenses, start=1):
        amt = e.get("amount", 0.0)
        print(f"{i:<4}{e.get('date',''):<12}{e.get('category',''):<18}{amt:<10.2f}{e.get('note','')}")

    total = sum(e.get("amount", 0.0) for e in expenses)
    print("-" * 60)
    print(f"Total spent: ₹{total:.2f} across {len(expenses)} transactions")


def view_summary_by_category_cli(user_name):
    users = load_users()
    expenses = users.get(user_name, {}).get("expenses", [])

    print(f"\n--- Summary by Category for [{user_name}] ---")
    if not expenses:
        print(f"No expenses recorded yet for {user_name}.")
        return

    totals = {}
    for e in expenses:
        cat = e.get("category", "Uncategorized")
        totals[cat] = totals.get(cat, 0.0) + float(e.get("amount", 0.0))

    for category, total in sorted(totals.items(), key=lambda x: -x[1]):
        print(f"{category:<18} ₹{total:.2f}")

    print("-" * 35)
    print(f"{'Grand Total':<18} ₹{sum(totals.values()):.2f}")


def delete_expense_cli(user_name):
    users = load_users()
    expenses = users.get(user_name, {}).get("expenses", [])

    view_expenses_cli(user_name)
    if not expenses:
        return

    try:
        choice = int(input("\nEnter the # of the expense to delete (0 to cancel): "))
    except ValueError:
        print("Please enter a valid number.")
        return

    if choice == 0:
        return

    sorted_expenses = sorted(expenses, key=lambda e: e.get("date", ""))
    if 1 <= choice <= len(sorted_expenses):
        target = sorted_expenses[choice - 1]
        expenses.remove(target)
        save_users(users)
        print(f"Deleted: {target.get('category')} - ₹{target.get('amount', 0.0):.2f} on {target.get('date')}")
    else:
        print("Invalid selection.")


# =====================================================================
# Web Server & REST API Integration
# =====================================================================

class ExpenseRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Request Handler serving tracker frontend and multi-user REST API with CORS support."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Route / or /index.html to /tracker.html
        if path in ("/", "/index.html"):
            self.path = "/tracker.html"
            return super().do_GET()

        # Ping / health check
        if path in ("/api/ping", "/api/session"):
            users = load_users()
            user_list = [{"username": u, "count": len(d.get("expenses", []))} for u, d in users.items()]
            return self._send_json({
                "status": "online",
                "message": "Python server is running",
                "users": user_list
            })

        # API: Return expenses for a specific user
        if path == "/api/expenses":
            users = load_users()
            username = query.get("user", ["anoop"])[0].strip().lower()
            if username not in users:
                # If user doesn't exist yet, return empty list
                return self._send_json([])
            return self._send_json(users[username].get("expenses", []))

        # API: Return summary statistics for a user
        if path == "/api/summary":
            users = load_users()
            username = query.get("user", ["anoop"])[0].strip().lower()
            expenses = users.get(username, {}).get("expenses", []) if username in users else []

            totals = {}
            for e in expenses:
                cat = e.get("category", "Uncategorized")
                totals[cat] = totals.get(cat, 0.0) + float(e.get("amount", 0.0))

            grand_total = sum(totals.values())
            return self._send_json({
                "user": username,
                "total_spent": grand_total,
                "count": len(expenses),
                "by_category": totals,
            })

        # Static file handling (tracker.css, tracker.js, etc.)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception as ex:
            return self._send_json({"error": f"Invalid JSON payload: {ex}"}, status=400)

        # API: User Login
        if path == "/api/auth/login":
            username = str(payload.get("username", "")).strip().lower()
            password = str(payload.get("password", "")).strip()

            if not username or not password:
                return self._send_json({"error": "Username and password are required."}, status=400)

            users = load_users()
            if username not in users:
                return self._send_json({"error": "User not found. Please register first."}, status=401)

            user_data = users[username]
            if user_data.get("password") != password:
                return self._send_json({"error": "Incorrect password. Please try again."}, status=401)

            return self._send_json({
                "status": "success",
                "message": f"Welcome back, {username}!",
                "username": username,
                "expenses": user_data.get("expenses", [])
            })

        # API: User Registration
        if path == "/api/auth/register":
            username = str(payload.get("username", "")).strip().lower()
            password = str(payload.get("password", "")).strip()

            if not username or not password:
                return self._send_json({"error": "Username and password cannot be empty."}, status=400)

            if len(username) < 2:
                return self._send_json({"error": "Username must be at least 2 characters long."}, status=400)

            users = load_users()
            if username in users:
                return self._send_json({"error": f"Username '{username}' is already taken."}, status=400)

            users[username] = {
                "password": password,
                "created_at": datetime.now().isoformat(),
                "expenses": []
            }
            save_users(users)

            return self._send_json({
                "status": "success",
                "message": f"Account '{username}' created successfully!",
                "username": username,
                "expenses": []
            }, status=201)

        # API: Add new expense
        if path == "/api/expenses":
            users = load_users()
            username = str(payload.get("user", "anoop")).strip().lower()

            if username not in users:
                users[username] = {"password": "1234", "created_at": datetime.now().isoformat(), "expenses": []}

            # Validate date
            date_str = str(payload.get("date", "")).strip()
            if not date_str:
                date_str = datetime.today().strftime("%Y-%m-%d")
            else:
                try:
                    datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    date_str = datetime.today().strftime("%Y-%m-%d")

            # Validate category
            category = str(payload.get("category", "Uncategorized")).strip().title()
            if not category:
                category = "Uncategorized"

            # Validate amount
            try:
                amount = float(payload.get("amount", 0))
                if amount <= 0:
                    return self._send_json({"error": "Amount must be greater than 0."}, status=400)
            except (ValueError, TypeError):
                return self._send_json({"error": "Invalid amount number."}, status=400)

            note = str(payload.get("note", "")).strip()

            new_expense = {
                "date": date_str,
                "category": category,
                "amount": round(amount, 2),
                "note": note,
            }

            user_expenses = users[username].setdefault("expenses", [])
            user_expenses.append(new_expense)
            save_users(users)

            return self._send_json({
                "status": "success",
                "message": "Expense added successfully",
                "expense": new_expense,
                "expenses": user_expenses,
            }, status=201)

        # API: Delete expense via POST (fallback for environments blocking DELETE)
        if path in ("/api/expenses/delete", "/api/delete"):
            try:
                index = int(payload.get("index"))
            except Exception as ex:
                return self._send_json({"error": f"Invalid delete payload: {ex}"}, status=400)

            username = str(payload.get("user", "anoop")).strip().lower()
            users = load_users()
            if username not in users:
                return self._send_json({"error": "User not found"}, status=404)

            expenses = users[username].get("expenses", [])
            if 0 <= index < len(expenses):
                deleted_item = expenses.pop(index)
                save_users(users)
                return self._send_json({
                    "status": "success",
                    "deleted": deleted_item,
                    "expenses": expenses,
                })
            else:
                return self._send_json({"error": "Index out of bounds"}, status=404)

        return self._send_json({"error": "Endpoint not found"}, status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # API: Delete expense by index: DELETE /api/expenses/<index>?user=<username>
        if path.startswith("/api/expenses/"):
            try:
                idx_str = path[len("/api/expenses/"):]
                index = int(idx_str)
            except ValueError:
                return self._send_json({"error": "Invalid expense index"}, status=400)

            username = query.get("user", ["anoop"])[0].strip().lower()
            users = load_users()
            if username not in users:
                return self._send_json({"error": "User not found"}, status=404)

            expenses = users[username].get("expenses", [])
            if 0 <= index < len(expenses):
                deleted_item = expenses.pop(index)
                save_users(users)
                return self._send_json({
                    "status": "success",
                    "deleted": deleted_item,
                    "expenses": expenses,
                })
            else:
                return self._send_json({"error": "Index out of bounds"}, status=404)

        return self._send_json({"error": "Endpoint not found"}, status=404)


def find_free_port(start_port=5000, max_attempts=50):
    """Find an open port to prevent 'Address already in use' errors."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port


def start_web_server(port=None, open_browser=True):
    """Start the Python HTTP server and open the web dashboard in browser."""
    # Ensure users and previous expenses are migrated
    users = load_users()
    anoop_count = len(users.get("anoop", {}).get("expenses", []))

    if port is None:
        port = find_free_port(5000)

    server_address = ("127.0.0.1", port)
    httpd = http.server.HTTPServer(server_address, ExpenseRequestHandler)
    app_url = f"http://127.0.0.1:{port}/"

    print("\n" + "=" * 62)
    print("🚀 SMART EXPENSE TRACKER - MULTI-USER WEB SERVER ACTIVE")
    print("=" * 62)
    print(f"🌐 Dashboard URL   : {app_url}")
    print(f"📁 Project Folder  : {BASE_DIR}")
    print(f"💾 Multi-User DB   : {USERS_FILE}")
    print(f"💾 Legacy DB File  : {DATA_FILE}")
    print(f"👤 Saved Profiles  : {', '.join(users.keys())}")
    print(f"📊 Anoop's Records : {anoop_count} expenses loaded safely")
    print("=" * 62)
    print("✨ Features:")
    print(" - Multi-User Login & Sign Up with password authentication")
    print(" - Dual-mode: Runs from Python server OR directly via HTML file")
    print(" - Press Ctrl+C in this terminal anytime to stop the server")
    print("=" * 62 + "\n")

    if open_browser:
        webbrowser.open(app_url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping web server...")
    finally:
        httpd.server_close()
        print("Web server stopped successfully.\n")


# =====================================================================
# Main Menu & Interactive CLI
# =====================================================================

def print_menu(active_user):
    print("\n===== Expense Tracker =====")
    print(f"Active User Profile: [{active_user}]")
    print("1. Launch Web Application (Recommended - Opens in Browser)")
    print("2. Add expense (CLI)")
    print("3. View all expenses (CLI)")
    print("4. View summary by category (CLI)")
    print("5. Delete an expense (CLI)")
    print("6. Switch CLI user profile")
    print("7. Exit")


def main():
    # Check for CLI flags: --web or --cli
    if "--web" in sys.argv or "-w" in sys.argv:
        start_web_server(open_browser=True)
        return

    users = load_users()
    active_user = get_cli_user(users)

    while True:
        print_menu(active_user)
        choice = input("Choose an option (1-7) [Press Enter for 1]: ").strip()

        if choice in ("1", ""):
            start_web_server(open_browser=True)
        elif choice == "2":
            add_expense_cli(active_user)
        elif choice == "3":
            view_expenses_cli(active_user)
        elif choice == "4":
            view_summary_by_category_cli(active_user)
        elif choice == "5":
            delete_expense_cli(active_user)
        elif choice == "6":
            users = load_users()
            print("\nAvailable profiles:", ", ".join(users.keys()))
            u = input("Enter username to switch to (or type new name to create): ").strip().lower()
            if u:
                if u not in users:
                    pwd = input(f"Set password for new user [{u}]: ").strip() or "1234"
                    users[u] = {"password": pwd, "created_at": datetime.now().isoformat(), "expenses": []}
                    save_users(users)
                    print(f"Created new profile: {u}")
                active_user = u
        elif choice == "7":
            print(f"Goodbye! All data safely stored in {USERS_FILE} and {DATA_FILE}")
            break
        else:
            print("Invalid option. Please choose 1-7.")


if __name__ == "__main__":
    main()