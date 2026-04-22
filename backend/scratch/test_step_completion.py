import requests
import time

BASE_URL = "http://localhost:8000/api"
EMAIL = "ritu.mishra.269@demo.hrms.internal"
PASSWORD = "Hrms@3sc2025!"

def main():
    print("Testing step completion logging in...")
    login = requests.post(f"{BASE_URL}/auth/token/", json={"email": EMAIL, "password": PASSWORD})
    headers = {"Authorization": f"Bearer {login.json()['access']}", "Content-Type": "application/json"}
    
    # 1. Ask to complete step 1
    query = "Complete step 1"
    print(f"Sending: {query}")
    chat = requests.post(f"{BASE_URL}/ai/chat/", json={"message": query}, headers=headers)
    print(chat.json()["reply"])
    print(chat.json().get("tool_results", {}).get("complete_roadmap_step"))

if __name__ == "__main__":
    main()
