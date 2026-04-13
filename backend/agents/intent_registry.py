INTENTS = {
    "leave_collection": {
        "description": (
            "User wants to apply for one or more leave types (SL, CL, EL/PL) in a single conversation, "
            "possibly providing dates and reasons across multiple turns."
        ),
        "examples": [
            "I want to apply 2 SL and 3 CL",
            "Apply 1 privilege leave and 2 sick leaves",
            "Request 3 casual leave and 1 earned leave",
            "I need sick leave for 2 days and casual leave for 3 days",
            "Apply leave: SL 2 days, CL 3 days, PL 1 day",
            "I want to take 2 sick leaves from Monday",
            "Apply multiple leave types",
        ],
    },
    "leave_application": {
        "description": "User wants to apply for a single leave or simulate leave details.",
        "examples": [
            "I want to apply for leave",
            "Apply for leave from 10th to 12th",
            "Request 2 days casual leave",
            "Can I take sick leave tomorrow",
            "Apply leave for three days",
        ],
    },
    "policy_query": {
        "description": "User asks about company policies or handbook.",
        "examples": [
            "What is the leave policy",
            "Show me the security policy guidelines",
            "Where is the employee handbook",
            "What are the rules for remote work",
            "Explain overtime policy",
        ],
    },
    "employee_query": {
        "description": (
            "User is asking about employee information, org structure, team members, "
            "manager hierarchy, department headcount, peers, new hires, or employee directory."
        ),
        "examples": [
            # Self profile
            "Who am I?",
            "What is my role?",
            "Show me my profile",
            "What department am I in?",
            "What is my employee ID?",
            "What is my title?",
            # Manager / reporting
            "Who is my manager?",
            "Who is John's manager?",
            "Who does Sarah report to?",
            "Show me the reporting chain for EMP003",
            "Who does Alice ultimately report to?",
            "What is the management hierarchy above Bob?",
            # Direct reports / team
            "Who is in my team?",
            "Who reports to me?",
            "List my direct reports",
            "How many people do I manage?",
            "Who are Alice's direct reports?",
            "Show me everyone under Bob",
            "Who reports to EMP005?",
            # Peers
            "Who are my peers?",
            "Who are John's teammates?",
            "Who else is in the same team as Sarah?",
            "Show me my colleagues",
            # Org tree
            "Show me the org chart under Alice",
            "Give me the full team structure for EMP010",
            "What does John's org look like?",
            "Who is under the Engineering manager?",
            # Department
            "List all employees in Engineering",
            "Who is in the HR department?",
            "Show everyone in Finance",
            "How many people are in Sales?",
            "What departments exist?",
            "Which is the largest department?",
            "List all teams in the company",
            # Search / filter
            "Find all senior engineers",
            "Who joined this year?",
            "Show employees with title Lead",
            "List all active managers",
            "Find employees in Engineering",
            # Largest teams
            "Who has the largest team?",
            "Which manager manages the most people?",
            "Top managers by team size",
            "Who has the most direct reports?",
            # New hires
            "Who joined recently?",
            "New hires this month",
            "Who has joined in the last 90 days?",
            "List recent joiners",
            # Role-based
            "List all managers",
            "Who are the HR people?",
            "Show all admins",
            "Who is the CFO?",
            # By employee ID string
            "Show me details for EMP007",
            "Who is employee EMP001?",
            "Get profile of EMP-012",
            # Contact info
            "What is Priya's phone number?",
            "Give me John's email address",
            "What is the email of Amit Sharma?",
            "How do I contact Ravi?",
            # Name search
            "Find John",
            "Search for someone named Priya",
            "Is there an employee called Neha Sharma?",
            "Who is Guru Laxmi?",
        ],
    },
    "nl_query": {
        "description": "General HRMS question not categorised as employee, leave, or policy.",
        "examples": [
            "How many holidays this month",
            "Show my notifications",
            "What is the office address?",
            "What is today's date?",
        ],
    },
}
