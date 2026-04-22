import requests
import time
import json

BASE_URL = "http://localhost:8000/api"
EMAIL = "ritu.mishra.269@demo.hrms.internal"
PASSWORD = "Hrms@3sc2025!"

def main():
    print("==================================================")
    print("Testing PM Upgrades (Real Links & Gamification)...")
    print("==================================================\n")
    
    # 1. Login
    print(f"[*] Logging in as {EMAIL}...")
    login = requests.post(f"{BASE_URL}/auth/token/", json={"email": EMAIL, "password": PASSWORD})
    if not login.ok:
        print(f"[!] Login failed: {login.text}")
        return
    headers = {"Authorization": f"Bearer {login.json()['access']}", "Content-Type": "application/json"}
    
    # 2. Ask for a roadmap
    query1 = "Create a roadmap for learning DevOps"
    print(f"\n[*] Sending query: '{query1}'")
    chat1 = requests.post(
        f"{BASE_URL}/ai/chat/", 
        json={"message": query1}, 
        headers=headers,
        timeout=150
    )
    if not chat1.ok:
        print("[!] Chat failed:", chat1.text)
        return
        
    data = chat1.json()
    tool_results = data.get("tool_results", {})
    roadmap = tool_results.get("generate_skill_roadmap", {})
    
    print("\n✅ Roadmap Generated successfully!")
    print(f"   Skill: {roadmap.get('skill_name')}")
    print(f"   Mentors Identified: {roadmap.get('mentors', [])}")
    
    steps = roadmap.get("steps", [])
    for i, s in enumerate(steps):
        print(f"   Step {s.get('order')}: {s.get('title')}")
        if s.get("resource_url"):
            print(f"      🔗 {s.get('resource_type').upper()} LINK: {s.get('resource_url')}")
    
    if "error" in roadmap:
        print("Error in roadmap:", roadmap["error"])
        return
        
    # 3. Complete Step 1
    query2 = "Complete step 1"
    print(f"\n[*] Sending query: '{query2}'")
    chat2 = requests.post(
        f"{BASE_URL}/ai/chat/", 
        json={"message": query2}, 
        headers=headers,
        timeout=150
    )
    response2 = chat2.json()
    print("\n✅ Step Completion Response:")
    print("   Agent Reply: ", response2.get("reply"))
    comp_tool = response2.get("tool_results", {}).get("complete_roadmap_step", {})
    print("   Tool backend message: ", comp_tool.get("message"))
    
if __name__ == "__main__":
    main()
