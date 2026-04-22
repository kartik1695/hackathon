INTENTS = {
    "leave_collection": {
        "description": (
            "User wants to apply for one or more leave types (SL, CL, PL, CO, LOP) in a single "
            "conversation, possibly providing dates and reasons across multiple turns."
        ),
        "examples": [
            "I want to apply 2 SL and 3 CL",
            "Apply 1 privilege leave and 2 sick leaves",
            "Request 3 casual leave and 1 privilege leave",
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
            "I need half day tomorrow morning",
            "Take AM half day on Friday",
            "Apply LOP for 2 days",
        ],
    },
    "approve_leave": {
        "description": "Manager wants to approve a leave request.",
        "examples": [
            "Approve leave #42",
            "Approve John's leave request",
            "I want to approve the pending leave",
            "Go ahead and approve leave 15",
            "Approve all pending leaves from my team",
            "Give approval for leave request 7",
        ],
    },
    "reject_leave": {
        "description": "Manager wants to reject a leave request with an optional reason.",
        "examples": [
            "Reject leave #42",
            "Reject John's leave request because we have a project deadline",
            "Decline leave 15",
            "I cannot approve this leave — reject it",
            "Reject the pending leave for Priya",
        ],
    },
    "cancel_leave": {
        "description": "Employee cancels their own pending leave. Manager cancels a team member's leave.",
        "examples": [
            "Cancel my leave",
            "Cancel my leave from April 20",
            "I want to withdraw my sick leave",
            "Cancel leave #33",
            "Please cancel the leave I applied yesterday",
            "Cancel Ravi's leave applied by mistake",
        ],
    },
    "comp_off_request": {
        "description": "Employee requests comp off credit for working on a holiday or weekend.",
        "examples": [
            "I worked on Sunday, need comp off",
            "Request comp off for working on 13th April",
            "I came to office on a holiday, please give me comp off",
            "Claim 1 comp off for working on weekend",
            "Apply for compensatory off",
            "I worked on Republic Day, need a comp off day",
        ],
    },
    "comp_off_approve": {
        "description": "Manager approves or rejects a comp off request.",
        "examples": [
            "Approve comp off #5",
            "Approve Ravi's comp off request",
            "Reject comp off #3 — he didn't really work",
            "Grant the comp off to Priya",
            "Review pending comp off requests",
        ],
    },
    "renotify_manager": {
        "description": "Employee re-notifies their manager about a pending leave that has had no action.",
        "examples": [
            "Remind my manager about my pending leave",
            "No response on my leave, please re-notify",
            "Send reminder to my manager for leave #12",
            "My leave is still pending, nudge manager",
            "Re-send the leave notification",
        ],
    },
    "leave_status": {
        "description": "Employee checks the status of their leave requests or pending leaves.",
        "examples": [
            "What is the status of my leave",
            "Show my pending leaves",
            "Are any of my leaves approved",
            "Show my leave requests",
            "What happened to my leave application",
            "List my approved leaves",
            "Show rejected leaves",
        ],
    },
    "pending_approvals": {
        "description": "Manager views pending leave and comp off requests from their team.",
        "examples": [
            "What are my pending approvals",
            "Show pending leaves from my team",
            "Any leave requests awaiting my action",
            "How many pending leaves do I have to approve",
            "Show me my actionables",
            "Who has applied for leave that I haven't approved",
        ],
    },
    "policy_query": {
        "description": "User asks about company policies or handbook.",
        "examples": [
            "What is the leave policy",
            "How many days of casual leave do I get",
            "What is the privilege leave policy",
            "Show me the security policy guidelines",
            "What are the rules for sick leave",
            "Can I backdate a leave",
        ],
    },
    "employee_query": {
        "description": (
            "User is asking about employee information, org structure, team members, "
            "manager hierarchy, department headcount, peers, new hires, or employee directory."
        ),
        "examples": [
            "Who am I?",
            "What is my role?",
            "Show me my profile",
            "Who is my manager?",
            "Who does Sarah report to?",
            "Who is in my team?",
            "Who reports to me?",
            "List my direct reports",
            "Who are my peers?",
            "Show me the org chart under Alice",
            "List all employees in Engineering",
            "Who joined this year?",
            "Who has the largest team?",
            "List all managers",
            "Show me details for EMP007",
            "What is Priya's phone number?",
            "Find John",
            "leave balance",
            "my balance",
            "attendance",
        ],
    },
    "burnout_check": {
        "description": "Check burnout indicators for an employee.",
        "examples": [
            "Check if Priya is burned out",
            "Is my team overworked",
            "Show burnout signals",
        ],
    },
    "review_summary": {
        "description": "Get performance review or appraisal summary.",
        "examples": [
            "Show performance review",
            "Appraisal summary for Q4",
            "How is John's rating",
        ],
    },
    "skill_roadmap": {
        "description": "User wants to create, view, approve, reject, or update an upskilling roadmap or roadmap step.",
        "examples": [
            "I want to learn Python, create a roadmap for me",
            "Show me my upskilling roadmaps",
            "Create a roadmap for React development",
            "I want to upskill in Machine Learning",
            "Show progress of my roadmaps",
            "I've finished the first step of my React roadmap",
            "Submit step 1 of my Python roadmap for review",
            "Approve step 2 for Sarah",
            "Reject step 3 for John as the link is not working",
            "Approve roadmap #5",
            "Reject roadmap #5 because it doesn't align with team goals",
            "Show pending roadmap approvals",
            "What roadmaps need my approval?",
            "Resubmit step 3 of my Kubernetes roadmap",
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
    "regularize_attendance": {
        "description": "Employee wants to regularize their attendance for a past date (missed check-in or check-out).",
        "examples": [
            "I forgot to check out yesterday, it was 6 PM",
            "Regularize my attendance for Monday",
            "I missed my punch out on 15th April",
            "Fix my attendance for last Friday, check-out was 7:30 PM",
            "Attendance correction for 2026-04-10",
            "I didn't check in on Tuesday, I was there from 9 AM to 6 PM",
        ],
    },
    "approve_regularization": {
        "description": "Manager approves or rejects a team member's regularization request.",
        "examples": [
            "Approve regularization #5",
            "Reject regularization #3 reason insufficient justification",
            "Show pending regularization requests from my team",
            "Approve Dinesh's attendance regularization",
        ],
    },
    "show_regularizations": {
        "description": "Show regularization requests for self or team.",
        "examples": [
            "Show my regularization requests",
            "My attendance corrections",
            "Pending regularizations for my team",
            "Status of my regularization request",
        ],
    },
    "apply_wfh": {
        "description": "Employee applies for work from home for one or more upcoming dates.",
        "examples": [
            "Apply WFH for Monday",
            "Work from home next week Monday and Wednesday",
            "WFH request for 21st to 25th April",
            "I want to work from home next week",
            "Apply WFH from 1st May to 5th May",
        ],
    },
    "approve_wfh": {
        "description": "Manager approves or rejects a team member's WFH request.",
        "examples": [
            "Approve WFH request #7",
            "Reject Dinesh's WFH request",
            "Show pending WFH requests from my team",
            "Approve WFH #3",
        ],
    },
    "show_wfh_requests": {
        "description": "Show WFH requests for self or team.",
        "examples": [
            "Show my WFH requests",
            "Team WFH for this week",
            "My pending WFH",
            "WFH status",
        ],
    },
    "show_penalties": {
        "description": "Show, waive, or reverse attendance penalties (PL/LOP deductions).",
        "examples": [
            "Show my attendance penalties",
            "I have an LOP deduction",
            "Waive penalty #3 reason incorrect",
            "My attendance deductions this month",
            "Show team penalties",
        ],
    },
}
