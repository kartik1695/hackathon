import requests
import json
import time

BASE_URL = "http://localhost:8000/api"
EMAIL = "ritu.mishra.269@demo.hrms.internal"
PASSWORD = "Hrms@3sc2025!"

def test_upskill_api():
    # 1. Login
    print(f"Logging in as {EMAIL}...")
    login_res = requests.post(f"{BASE_URL}/auth/token/", json={"email": EMAIL, "password": PASSWORD})
    if not login_res.ok:
        print(f"Login failed: {login_res.text}")
        return
    
    tokens = login_res.json()
    access_token = tokens["access"]
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    
    # 2. Send upskill request
    query = "I want to learn Python, create a roadmap for me"
    print(f"Sending query: '{query}'")
    
    start_time = time.time()
    chat_res = requests.post(
        f"{BASE_URL}/ai/chat/", 
        json={"message": query}, 
        headers=headers,
        timeout=150 # Large timeout as per our earlier fix
    )
    end_time = time.time()
    
    print(f"Request took {end_time - start_time:.2f} seconds")
    
    if not chat_res.ok:
        print(f"Chat failed: {chat_res.status_code}")
        print(chat_res.text)
        return
    
    data = chat_res.json()
    print("\nResponse Reply:")
    print(data.get("reply"))
    
    tool_results = data.get("tool_results", {})
    if "generate_skill_roadmap" in tool_results:
        print("\n✅ Success! Roadmap generated.")
        roadmap = tool_results["generate_skill_roadmap"]
        print(f"Skill: {roadmap.get('skill_name')}")
        print(f"Description: {roadmap.get('description')}")
        steps = roadmap.get("steps", [])
        print(f"Steps ({len(steps)}):")
        for s in steps:
            print(f"  - {s.get('title')}")
    else:
        print("\n❌ Failure: No roadmap in tool_results")
        print("Raw data keys:", data.keys())

if __name__ == "__main__":
    test_upskill_api()
