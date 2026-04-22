import json
import logging
import time
import re
from django.utils import timezone
from mcp.rbac import ensure_role
from mcp.registry import tool

logger = logging.getLogger("hrms")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_updated_roadmap_details(roadmap):
    """Helper to return the standardized roadmap detail shape used by the UI."""
    steps = roadmap.steps.all().order_by("order")
    steps_data = []
    for s in steps:
        steps_data.append({
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "order": s.order,
            "status": s.status,
            "is_completed": s.is_completed,
            "phase": s.phase,
            "difficulty": s.difficulty,
            "resource_url": s.resource_url,
            "submission_notes": s.submission_notes,
            "submission_url": s.submission_url,
            "feedback": s.feedback
        })
    return {
        "id": roadmap.id,
        "employee_id": roadmap.employee_id,
        "skill_name": roadmap.skill_name,
        "description": roadmap.description,
        "status": roadmap.status,
        "steps": steps_data,
        "employee_name": roadmap.employee.user.name if roadmap.employee.user else "Employee"
    }


def _is_actual_manager(requester_id: int, employee_id: int) -> bool:
    """Verify that the requester is the actual manager of the employee (not just any manager)."""
    try:
        from apps.employees.models import Employee
        employee = Employee.objects.select_related("manager__user").get(id=employee_id)
        if not employee.manager:
            return False
        return employee.manager.user_id == requester_id
    except Exception:
        return False


# ─── Roadmap Lifecycle ─────────────────────────────────────────────────────────

@tool("generate_skill_roadmap")
def generate_skill_roadmap(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Design a high-impact professional career growth roadmap for an employee.
    
    Creates the roadmap in PENDING_APPROVAL status. The employee's manager
    must approve it before work can begin.
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "admin"])
    if err:
        return err

    skill_name = (input_data or {}).get("skill_name")
    if not skill_name:
        return {"error": "skill_name is required"}

    from apps.upskilling.models import SkillRoadmap, RoadmapStep
    
    # DEDUPLICATION: Check if a roadmap for this skill already exists
    existing = SkillRoadmap.objects.filter(employee_id=employee_id, skill_name__iexact=skill_name).first()
    if existing:
        res = _get_updated_roadmap_details(existing)
        if existing.status == "COMPLETED":
            res["message"] = f"You have already mastered '{existing.skill_name}' on {existing.updated_at.strftime('%Y-%m-%d')}. Would you like to review your roadmap or explore advanced certifications?"
        elif existing.status == "PENDING_APPROVAL":
            res["message"] = f"A roadmap for '{existing.skill_name}' is already pending your manager's approval. Sit tight — they'll review it soon."
        elif existing.status == "REJECTED":
            res["message"] = f"Your previous '{existing.skill_name}' roadmap was rejected. You may want to discuss this with your manager before requesting again."
        else:
            res["message"] = f"A roadmap for '{existing.skill_name}' is already in progress. Here is your current track."
        res["already_exists"] = True
        return res

    from core.llm.factory import LLMProviderFactory
    from core.llm.base import LLMMessage

    system_prompt = (
        "You are a Senior Learning & Development Architect and Subject Matter Expert (SME). "
        "Your task is to design a high-impact, professional Career Growth Roadmap for an employee. "
        "Think strategically: A roadmap is not just a list of links; it is a journey from curiosity to mastery.\n\n"
        "Guidelines:\n"
        "1. Phases: 'Foundation', 'Tactical Implementation', 'Strategic Mastery'.\n"
        "2. Step details: 'title', 'description', 'difficulty', 'duration'.\n"
        "3. RESOURCE RULES:\n"
        "   - 'resource_type': ALWAYS 'video'.\n"
        "   - 'resource_url': ALWAYS a high-quality YouTube link (video or playlist).\n\n"
        "Return ONLY a valid JSON object matching this schema:\n"
        "{\n"
        "  \"description\": \"...\",\n"
        "  \"steps\": [\n"
        "    {\n"
        "      \"phase\": \"...\",\n"
        "      \"title\": \"...\",\n"
        "      \"description\": \"...\",\n"
        "      \"difficulty\": \"...\",\n"
        "      \"duration\": 0,\n"
        "      \"resource_type\": \"video\",\n"
        "      \"resource_url\": \"https://www.youtube.com/...\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )
    user_prompt = f"Create a roadmap for learning: {skill_name}"

    try:
        provider = LLMProviderFactory.get_provider()
        resp = provider.complete([
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=user_prompt)
        ], temperature=0.0)
        
        content = resp.content.strip()
        match = re.search(r'\{.*\}', content, re.DOTALL)
        roadmap_data = json.loads(match.group(0)) if match else json.loads(content)
    except Exception as e:
        logger.exception("Failed to generate roadmap content")
        return {"error": f"Failed to generate roadmap content: {str(e)}"}

    # Create roadmap in PENDING_APPROVAL — manager must approve before work starts
    roadmap = SkillRoadmap.objects.create(
        employee_id=employee_id,
        skill_name=skill_name,
        description=roadmap_data.get("description", ""),
        status="PENDING_APPROVAL"
    )

    for i, step_data in enumerate(roadmap_data.get("steps", [])):
        RoadmapStep.objects.create(
            roadmap=roadmap,
            title=step_data.get("title", ""),
            description=step_data.get("description", ""),
            order=i + 1,
            resource_url=step_data.get("resource_url", ""),
            resource_type=step_data.get("resource_type", "video"),
            phase=step_data.get("phase", ""),
            difficulty=step_data.get("difficulty", "Intermediate"),
            duration=step_data.get("duration", 1),
            status="PENDING"  # All steps start as PENDING until roadmap is approved
        )

    # Return full details for UI
    result = _get_updated_roadmap_details(roadmap)
    
    # Add mentors
    from apps.upskilling.models import EmployeeSkill
    mentors_qs = EmployeeSkill.objects.filter(skill__name__icontains=skill_name, level__gte=3).exclude(employee_id=employee_id).select_related('employee__user')[:3]
    result["mentors"] = [m.employee.user.name for m in mentors_qs if m.employee.user.name]
    
    # NOTIFICATION: Notify manager for approval
    from apps.notifications.services import InAppNotificationService
    try:
        from apps.employees.models import Employee
        employee = Employee.objects.select_related("manager__user", "user").get(id=employee_id)
        manager = employee.manager
        if manager:
            service = InAppNotificationService()
            service.create_notification(
                recipient_email=manager.user.email,
                subject=f"Upskilling Approval Required: {employee.user.name}",
                body=(
                    f"{employee.user.name} has requested an upskilling roadmap for '{skill_name}'. "
                    f"The roadmap has {len(roadmap_data.get('steps', []))} milestones across 3 phases. "
                    f"Please review and approve or reject it."
                ),
                metadata={
                    "type": "roadmap_approval",
                    "employee_id": employee_id,
                    "roadmap_id": roadmap.id,
                    "action_required": True,
                }
            )
            result["message"] = (
                f"Your '{skill_name}' roadmap has been created and sent to your manager "
                f"({manager.user.name}) for approval. You'll be notified once it's approved."
            )
        else:
            # No manager — auto-approve
            roadmap.status = "IN_PROGRESS"
            roadmap.save(update_fields=["status"])
            first_step = roadmap.steps.order_by("order").first()
            if first_step:
                first_step.status = "IN_PROGRESS"
                first_step.save(update_fields=["status"])
            result["message"] = f"Your '{skill_name}' roadmap is ready! No manager found — auto-approved. Start with Step 1."
            result = _get_updated_roadmap_details(roadmap)  # Refresh after status update
    except Exception:
        logger.exception("Failed to notify manager for roadmap approval")
        result["message"] = f"Your '{skill_name}' roadmap has been created and is pending approval."

    return result


@tool("approve_roadmap")
def approve_roadmap(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager approves an employee's upskilling roadmap, allowing them to begin working on it."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err

    roadmap_id = (input_data or {}).get("roadmap_id")
    if not roadmap_id:
        return {"error": "roadmap_id is required"}

    from apps.upskilling.models import SkillRoadmap
    try:
        roadmap = SkillRoadmap.objects.select_related("employee__user", "employee__manager__user").get(id=roadmap_id)
    except SkillRoadmap.DoesNotExist:
        return {"error": "Roadmap not found."}

    # Authorization: must be this employee's actual manager (or HR/admin)
    if requester_role == "manager" and not _is_actual_manager(requester_id, roadmap.employee_id):
        return {"error": "You can only approve roadmaps for your direct reports."}

    if roadmap.status != "PENDING_APPROVAL":
        return {"error": f"This roadmap cannot be approved because its status is '{roadmap.status}'. Only PENDING_APPROVAL roadmaps can be approved."}

    roadmap.status = "IN_PROGRESS"
    roadmap.save(update_fields=["status", "updated_at"])

    # Activate the first step
    first_step = roadmap.steps.order_by("order").first()
    if first_step and first_step.status == "PENDING":
        first_step.status = "IN_PROGRESS"
        first_step.save(update_fields=["status"])

    res = _get_updated_roadmap_details(roadmap)
    res["message"] = f"✅ Roadmap '{roadmap.skill_name}' approved for {roadmap.employee.user.name}. They can now start their learning journey."

    # NOTIFICATION: Notify employee
    from apps.notifications.services import InAppNotificationService
    service = InAppNotificationService()
    service.create_notification(
        recipient_email=roadmap.employee.user.email,
        subject=f"Roadmap Approved: {roadmap.skill_name}",
        body=f"Great news! Your manager has approved your '{roadmap.skill_name}' upskilling roadmap. Start with the first milestone now!",
        metadata={"type": "roadmap_update", "roadmap_id": roadmap.id, "status": "APPROVED"}
    )

    return res


@tool("reject_roadmap")
def reject_roadmap(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager rejects an employee's upskilling roadmap with feedback."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err

    roadmap_id = (input_data or {}).get("roadmap_id")
    feedback = (input_data or {}).get("feedback", "")
    if not roadmap_id:
        return {"error": "roadmap_id is required"}
    if not feedback:
        return {"error": "Feedback is required when rejecting a roadmap."}

    from apps.upskilling.models import SkillRoadmap
    try:
        roadmap = SkillRoadmap.objects.select_related("employee__user", "employee__manager__user").get(id=roadmap_id)
    except SkillRoadmap.DoesNotExist:
        return {"error": "Roadmap not found."}

    # Authorization
    if requester_role == "manager" and not _is_actual_manager(requester_id, roadmap.employee_id):
        return {"error": "You can only reject roadmaps for your direct reports."}

    if roadmap.status != "PENDING_APPROVAL":
        return {"error": f"This roadmap cannot be rejected because its status is '{roadmap.status}'. Only PENDING_APPROVAL roadmaps can be rejected."}

    roadmap.status = "REJECTED"
    roadmap.description = f"{roadmap.description}\n\n---\nManager Feedback: {feedback}"
    roadmap.save(update_fields=["status", "description", "updated_at"])

    res = _get_updated_roadmap_details(roadmap)
    res["message"] = f"❌ Roadmap '{roadmap.skill_name}' rejected. Feedback: {feedback}"
    res["feedback"] = feedback

    # NOTIFICATION: Notify employee
    from apps.notifications.services import InAppNotificationService
    service = InAppNotificationService()
    service.create_notification(
        recipient_email=roadmap.employee.user.email,
        subject=f"Roadmap Not Approved: {roadmap.skill_name}",
        body=f"Your manager has reviewed your '{roadmap.skill_name}' roadmap and declined it. Reason: {feedback}",
        metadata={"type": "roadmap_update", "roadmap_id": roadmap.id, "status": "REJECTED"}
    )

    return res


# ─── Roadmap Queries ───────────────────────────────────────────────────────────

@tool("get_skill_roadmaps")
def get_skill_roadmaps(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """List all upskilling roadmaps for an employee."""
    err = ensure_role(requester_role, ["employee", "manager", "hr", "admin"])
    if err: return err

    from apps.upskilling.models import SkillRoadmap
    roadmaps = SkillRoadmap.objects.filter(employee_id=employee_id).order_by("-created_at")
    data = []
    for r in roadmaps:
        data.append({
            "id": r.id,
            "skill_name": r.skill_name,
            "status": r.status,
            "created_at": r.created_at.isoformat()
        })
    return {"roadmaps": data}

@tool("get_roadmap_details")
def get_roadmap_details(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Get detailed steps and status for a specific roadmap."""
    err = ensure_role(requester_role, ["employee", "manager", "hr", "admin"])
    if err: return err

    roadmap_id = (input_data or {}).get("roadmap_id")
    if not roadmap_id: return {"error": "roadmap_id is required"}

    from apps.upskilling.models import SkillRoadmap
    try:
        roadmap = SkillRoadmap.objects.select_related('employee__user').prefetch_related('steps').get(id=roadmap_id)
        
        # Admin/HR can see anything. Employees can see their own. Managers can see direct reports.
        if requester_role in ['admin', 'hr'] or roadmap.employee_id == employee_id:
            return _get_updated_roadmap_details(roadmap)
        
        if requester_role == 'manager' and _is_actual_manager(requester_id, roadmap.employee_id):
            return _get_updated_roadmap_details(roadmap)
            
        return {"error": "You do not have permission to view this roadmap."}
    except SkillRoadmap.DoesNotExist:
        return {"error": "Roadmap not found"}


# ─── Step Lifecycle ────────────────────────────────────────────────────────────

@tool("submit_roadmap_step")
def submit_roadmap_step(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Employee submits a roadmap step for review with evidence.
    
    Allowed from IN_PROGRESS or REJECTED (re-submission after rejection).
    """
    err = ensure_role(requester_role, ["employee", "manager", "admin"])
    if err: return err

    step_id = (input_data or {}).get("step_id")
    notes = (input_data or {}).get("notes", "")
    url = (input_data or {}).get("url", "")

    if not step_id: return {"error": "step_id is required"}

    # REQUIREMENT: Must have a valid GitHub or Dropbox link
    if not url or not any(domain in url.lower() for domain in ("github.com", "dropbox.com")):
        return {"error": "Submission failed. Please provide a valid evidence link (GitHub or Dropbox) to submit this milestone."}

    from apps.upskilling.models import RoadmapStep, SkillRoadmap
    step = None
    if isinstance(step_id, int) and step_id <= 20:
        latest = SkillRoadmap.objects.filter(employee_id=employee_id, status="IN_PROGRESS").first()
        if latest: step = RoadmapStep.objects.filter(roadmap=latest, order=step_id).first()
    
    if not step:
        try: step = RoadmapStep.objects.get(id=step_id, roadmap__employee_id=employee_id)
        except RoadmapStep.DoesNotExist: return {"error": "Step not found."}

    # Validate roadmap is approved and in progress
    if step.roadmap.status == "PENDING_APPROVAL":
        return {"error": "Your roadmap is still pending manager approval. You cannot submit steps yet."}
    if step.roadmap.status == "REJECTED":
        return {"error": "Your roadmap has been rejected by your manager. Please discuss it with them."}

    if step.status == "APPROVED": return {"error": "This milestone is already approved and completed."}
    if step.status == "SUBMITTED": return {"error": "This milestone is already awaiting manager review."}
    # Allow re-submission from REJECTED state (employee revised their work)
    if step.status not in ("IN_PROGRESS", "REJECTED"):
        return {"error": f"You can only submit proof for 'In Progress' or 'Rejected' steps (Current: {step.status})."}

    step.status = "SUBMITTED"
    step.submission_notes = notes
    step.submission_url = url
    step.feedback = ""  # Clear previous rejection feedback on re-submission
    step.save()

    # NOTIFICATION: Notify manager if they exist
    from apps.notifications.services import InAppNotificationService
    manager = step.roadmap.employee.manager
    if manager:
        resubmit_note = " (re-submission after revision)" if step.feedback else ""
        service = InAppNotificationService()
        service.create_notification(
            recipient_email=manager.user.email,
            subject=f"Upskilling Milestone Review: {step.roadmap.employee.user.name}",
            body=f"{step.roadmap.employee.user.name} has submitted proof for step '{step.title}' in the '{step.roadmap.skill_name}' roadmap{resubmit_note}. Review it now.",
            metadata={
                "type": "roadmap_review",
                "employee_id": employee_id,
                "roadmap_id": step.roadmap.id,
                "step_id": step.id,
                "action": "show_roadmap_details"
            }
        )

    # CRITICAL: Return updated roadmap so UI updates in the latest bubble
    res = _get_updated_roadmap_details(step.roadmap)
    res["message"] = f"✅ Step '{step.title}' submitted for review. Your manager ({manager.user.name if manager else 'N/A'}) has been notified."
    return res

@tool("approve_roadmap_step")
def approve_roadmap_step(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager approves a submitted roadmap step."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err: return err

    step_id = (input_data or {}).get("step_id")
    feedback = (input_data or {}).get("feedback", "Excellent work!")
    if not step_id: return {"error": "step_id is required"}

    from apps.upskilling.models import RoadmapStep, Skill, EmployeeSkill
    try: step = RoadmapStep.objects.select_related("roadmap__employee__user", "roadmap__employee__manager__user").get(id=step_id)
    except RoadmapStep.DoesNotExist: return {"error": "Step not found."}

    # Authorization: must be the employee's actual manager (or HR/admin)
    if requester_role == "manager" and not _is_actual_manager(requester_id, step.roadmap.employee_id):
        return {"error": "You can only approve steps for your direct reports."}

    if step.status != "SUBMITTED":
        return {"error": f"This step cannot be approved because its status is '{step.status}'. It must be 'SUBMITTED' by the employee first."}

    step.status = "APPROVED"
    step.is_completed = True
    step.completed_at = timezone.now()
    step.reviewed_by_id = requester_id
    step.reviewed_at = timezone.now()
    step.feedback = feedback
    step.save()

    # Activate next step
    next_step = step.roadmap.steps.filter(order__gt=step.order).order_by('order').first()
    if next_step and next_step.status == "PENDING":
        next_step.status = "IN_PROGRESS"
        next_step.save()

    # Check if whole roadmap is done
    roadmap = step.roadmap
    if not roadmap.steps.filter(is_completed=False).exists():
        roadmap.status = "COMPLETED"
        roadmap.save()
        skill, _ = Skill.objects.get_or_create(name=roadmap.skill_name)
        EmployeeSkill.objects.get_or_create(employee=roadmap.employee, skill=skill, defaults={"level": 1})
    
    res = _get_updated_roadmap_details(roadmap)
    res["message"] = f"✅ Step '{step.title}' approved."

    # NOTIFICATION: Notify employee
    from apps.notifications.services import InAppNotificationService
    service = InAppNotificationService()
    body = f"Excellent work mastering '{step.title}'! Your manager has approved your submission."
    if next_step:
        body += f" You can now proceed to the next milestone: '{next_step.title}'."
    elif not roadmap.steps.filter(is_completed=False).exists():
        body += f" 🎉 Congratulations — you've completed the entire '{roadmap.skill_name}' roadmap!"
    service.create_notification(
        recipient_email=roadmap.employee.user.email,
        subject=f"Milestone Mastered: {step.title}",
        body=body,
        metadata={"type": "roadmap_update", "roadmap_id": roadmap.id, "step_id": step.id, "status": "APPROVED"}
    )

    return res

@tool("reject_roadmap_step")
def reject_roadmap_step(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager rejects a submitted roadmap step with feedback. Employee can re-submit."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err: return err

    step_id = (input_data or {}).get("step_id")
    feedback = (input_data or {}).get("feedback", "")
    if not feedback: return {"error": "Feedback is required for rejection."}

    from apps.upskilling.models import RoadmapStep
    try: step = RoadmapStep.objects.select_related("roadmap__employee__user", "roadmap__employee__manager__user").get(id=step_id)
    except RoadmapStep.DoesNotExist: return {"error": "Step not found."}

    # Authorization
    if requester_role == "manager" and not _is_actual_manager(requester_id, step.roadmap.employee_id):
        return {"error": "You can only reject steps for your direct reports."}

    if step.status != "SUBMITTED":
        return {"error": f"This step cannot be rejected because its status is '{step.status}'. Rejection is only for 'SUBMITTED' steps."}

    step.status = "REJECTED"
    step.reviewed_by_id = requester_id
    step.reviewed_at = timezone.now()
    step.feedback = feedback
    step.save()

    res = _get_updated_roadmap_details(step.roadmap)
    res["message"] = f"❌ Step rejected with feedback: {feedback}"

    # NOTIFICATION: Notify employee
    from apps.notifications.services import InAppNotificationService
    service = InAppNotificationService()
    service.create_notification(
        recipient_email=step.roadmap.employee.user.email,
        subject=f"Revision Needed: {step.title}",
        body=f"Your manager has reviewed your submission for '{step.title}' and requested some revisions: {feedback}. You can re-submit once you've made the changes.",
        metadata={"type": "roadmap_update", "roadmap_id": step.roadmap.id, "step_id": step.id, "status": "REJECTED"}
    )

    return res


# ─── Manager Pending Roadmap Approvals ─────────────────────────────────────────

@tool("get_pending_roadmap_approvals")
def get_pending_roadmap_approvals(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager views all roadmaps from direct reports that are pending approval."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err

    from apps.upskilling.models import SkillRoadmap
    from apps.employees.models import Employee

    try:
        manager = Employee.objects.get(user_id=requester_id)
    except Employee.DoesNotExist:
        return {"error": "Employee profile not found."}

    pending = SkillRoadmap.objects.filter(
        employee__manager=manager,
        status="PENDING_APPROVAL"
    ).select_related("employee__user").order_by("-created_at")

    data = []
    for r in pending:
        data.append({
            "id": r.id,
            "skill_name": r.skill_name,
            "employee_name": r.employee.user.name,
            "employee_id": r.employee_id,
            "created_at": r.created_at.isoformat(),
            "step_count": r.steps.count(),
        })

    return {"pending_roadmaps": data, "total": len(data)}
