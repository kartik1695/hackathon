import os
import sys
import django
import json

# Add current directory to sys.path
sys.path.append(os.getcwd())

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["OLLAMA_BASE_URL"] = "http://localhost:11434"
os.environ["OLLAMA_MODEL"] = "llama3"
os.environ["EMBEDDING_PROVIDER"] = "ollama"
os.environ["OLLAMA_EMBED_MODEL"] = "nomic-embed-text"

# Use SQLite for testing to avoid Postgres dependency
from django.conf import settings
if not settings.configured:
    django.setup()

# Override database to sqlite for this test run
from django.db import connection
from django.test.utils import override_settings

@override_settings(DATABASES={
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
})
def run_tests():
    django.setup()
    from django.core.management import call_command
    call_command('migrate', verbosity=0)

    from apps.employees.models import User, Employee, Department
    from apps.upskilling.models import Skill, EmployeeSkill, SkillRoadmap, RoadmapStep
    from agents.graph import run_agent

    # 1. Seed Data
    print("--- Seeding Test Data ---")
    dept, _ = Department.objects.get_or_create(name="Engineering", code="ENG")
    user = User.objects.create_user(
        email="kartik@example.com",
        password="testpassword",
        name="Kartik",
        phone_number="1234567890"
    )
    employee = Employee.objects.create(
        user=user,
        employee_id="EMP001",
        role="manager",
        department=dept,
        title="Senior Engineering Manager"
    )
    print(f"Created employee: {employee.user.name} (ID: {employee.employee_id}, Role: {employee.role})")

    # 2. Test General Service (Who am I?)
    print("\n--- Testing General Service ---")
    state = {
        "employee_id": employee.id,
        "requester_id": user.id,
        "requester_role": employee.role,
        "input_data": {"query": "Who am I?"},
        "chat_history": []
    }
    
    result = run_agent(state)
    print(f"Query: {state['input_data']['query']}")
    print(f"Intent identified: {result.get('intent')}")
    print(f"Response: {result.get('llm_response')}")

    # 3. Test Upskill Things (Create Roadmap)
    print("\n--- Testing Upskill Things (Create Roadmap) ---")
    state = {
        "employee_id": employee.id,
        "requester_id": user.id,
        "requester_role": employee.role,
        "input_data": {"query": "I want to learn Python, create a roadmap for me"},
        "chat_history": []
    }
    
    result = run_agent(state)
    print(f"Query: {state['input_data']['query']}")
    print(f"Intent identified: {result.get('intent')}")
    print(f"Response: {result.get('llm_response')}")
    
    # Check if roadmap was created in DB
    roadmaps = SkillRoadmap.objects.filter(employee=employee)
    print(f"Roadmaps in DB: {roadmaps.count()}")
    for r in roadmaps:
        print(f"- Roadmap: {r.skill_name}, Status: {r.status}, Steps: {r.steps.count()}")

    # 4. Test Upskill Things (List Roadmaps)
    print("\n--- Testing Upskill Things (List Roadmaps) ---")
    state = {
        "employee_id": employee.id,
        "requester_id": user.id,
        "requester_role": employee.role,
        "input_data": {"query": "Show me my upskilling roadmaps"},
        "chat_history": [
            {"role": "user", "content": "I want to learn Python, create a roadmap for me"},
            {"role": "assistant", "content": result.get('llm_response')}
        ]
    }
    
    result = run_agent(state)
    print(f"Query: {state['input_data']['query']}")
    print(f"Intent identified: {result.get('intent')}")
    print(f"Response: {result.get('llm_response')}")

if __name__ == "__main__":
    run_tests()
