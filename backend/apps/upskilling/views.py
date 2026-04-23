import logging
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.permissions import IsAuthenticated

from core.permissions import IsEmployee, IsManager
from .models import SkillRoadmap, RoadmapStep
from .serializers import SkillRoadmapSerializer, SkillRoadmapListSerializer, RoadmapStepSerializer

logger = logging.getLogger("hrms")


def _get_employee(user):
    try:
        return user.employee
    except Exception:
        return None


class RoadmapListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)
        roadmaps = SkillRoadmap.objects.filter(employee=emp).prefetch_related("steps").order_by("-created_at")
        return Response(SkillRoadmapListSerializer(roadmaps, many=True).data)

    def post(self, request):
        """Trigger AI roadmap generation via MCP tool layer."""
        skill_name = request.data.get("skill_name", "").strip()
        if not skill_name:
            return Response({"error": "skill_name required", "code": "MISSING_FIELD"}, status=400)

        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import generate_skill_roadmap
        result = generate_skill_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"skill_name": skill_name},
        )
        if "error" in result:
            return Response(result, status=400)

        try:
            roadmap = SkillRoadmap.objects.prefetch_related("steps").get(id=result["id"])
            return Response(SkillRoadmapSerializer(roadmap).data, status=201)
        except SkillRoadmap.DoesNotExist:
            return Response(result, status=201)


class RoadmapDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def _get_roadmap(self, pk, emp):
        try:
            roadmap = SkillRoadmap.objects.prefetch_related("steps").get(pk=pk)
        except SkillRoadmap.DoesNotExist:
            return None, Response({"error": "Not found"}, status=404)

        role = emp.role
        if role in ("admin", "hr"):
            return roadmap, None
        if roadmap.employee_id == emp.id:
            return roadmap, None
        if role == "manager" and roadmap.employee.manager_id == emp.id:
            return roadmap, None

        return None, Response({"error": "Forbidden"}, status=403)

    def get(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)
        roadmap, err = self._get_roadmap(pk, emp)
        if err:
            return err
        return Response(SkillRoadmapSerializer(roadmap).data)


class RoadmapApproveView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import approve_roadmap
        result = approve_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"roadmap_id": pk},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class RoadmapRejectView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        feedback = request.data.get("feedback", "").strip()
        if not feedback:
            return Response({"error": "feedback required", "code": "MISSING_FIELD"}, status=400)

        from mcp.tools.upskilling_tools import reject_roadmap
        result = reject_roadmap(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"roadmap_id": pk, "feedback": feedback},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class PendingRoadmapApprovalsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        roadmaps = SkillRoadmap.objects.filter(
            employee__manager=emp,
            status="PENDING_APPROVAL",
        ).select_related("employee__user").prefetch_related("steps").order_by("-created_at")

        return Response(SkillRoadmapListSerializer(roadmaps, many=True).data)


class StepSubmitView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import submit_roadmap_step
        result = submit_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={
                "step_id": pk,
                "notes": request.data.get("notes", ""),
                "url": request.data.get("url", ""),
            },
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class StepApproveView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        from mcp.tools.upskilling_tools import approve_roadmap_step
        result = approve_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"step_id": pk, "feedback": request.data.get("feedback", "Excellent work!")},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class StepRejectView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        feedback = request.data.get("feedback", "").strip()
        if not feedback:
            return Response({"error": "feedback required", "code": "MISSING_FIELD"}, status=400)

        from mcp.tools.upskilling_tools import reject_roadmap_step
        result = reject_roadmap_step(
            employee_id=emp.id,
            requester_id=request.user.id,
            requester_role=emp.role,
            input_data={"step_id": pk, "feedback": feedback},
        )
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class TeamRoadmapsView(APIView):
    """Manager: view all roadmaps for direct reports."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        status_filter = request.query_params.get("status")
        qs = SkillRoadmap.objects.filter(
            employee__manager=emp,
        ).select_related("employee__user").prefetch_related("steps").order_by("-created_at")

        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        return Response(SkillRoadmapListSerializer(qs, many=True).data)


class OrgLearningInsightsView(APIView):
    """
    GET /upskilling/org-insights/
    Org-wide learning analytics:
    - trending skills (top 10 by roadmap count)
    - dept breakdown (skills per dept)
    - status distribution
    - team insights (manager only: per-member progress)
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def get(self, request):
        from django.db.models import Count, Avg
        from django.utils import timezone
        from datetime import timedelta
        from apps.employees.models import Employee

        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        active_statuses = ["IN_PROGRESS", "PENDING_APPROVAL", "PENDING_REVIEW", "COMPLETED"]
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)

        # Trending skills org-wide
        trending = list(
            SkillRoadmap.objects
            .filter(status__in=active_statuses)
            .values("skill_name")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        # Department breakdown with completion rate
        dept_raw = (
            SkillRoadmap.objects
            .filter(status__in=active_statuses)
            .select_related("employee__department")
            .values("employee__department__name")
            .annotate(total=Count("id"), done=Count("id", filter=Count("id", filter=None)))
            .order_by("-total")[:8]
        )
        # simpler dept breakdown
        from django.db.models import Q as DQ
        dept_data = []
        for dept_name in (
            SkillRoadmap.objects
            .filter(status__in=active_statuses)
            .values_list("employee__department__name", flat=True)
            .distinct()
        ):
            total_d = SkillRoadmap.objects.filter(employee__department__name=dept_name, status__in=active_statuses).count()
            completed_d = SkillRoadmap.objects.filter(employee__department__name=dept_name, status="COMPLETED").count()
            dept_data.append({
                "dept": dept_name or "Unknown",
                "count": total_d,
                "completed": completed_d,
                "completion_rate": round(completed_d / total_d * 100) if total_d else 0,
            })
        dept_data.sort(key=lambda x: -x["count"])

        # Status distribution
        status_dist = list(
            SkillRoadmap.objects.values("status").annotate(count=Count("id"))
        )

        # Totals
        total = SkillRoadmap.objects.count()
        completed = SkillRoadmap.objects.filter(status="COMPLETED").count()
        in_progress = SkillRoadmap.objects.filter(status="IN_PROGRESS").count()
        new_this_month = SkillRoadmap.objects.filter(created_at__gte=thirty_days_ago).count()
        new_this_week = SkillRoadmap.objects.filter(created_at__gte=seven_days_ago).count()

        # Active learners count
        active_learners = (
            SkillRoadmap.objects
            .filter(status__in=["IN_PROGRESS", "PENDING_REVIEW"])
            .values("employee_id").distinct().count()
        )

        # Top learners (most completed steps)
        from .models import RoadmapStep
        top_learners = []
        learner_data = (
            RoadmapStep.objects
            .filter(is_completed=True)
            .values("roadmap__employee__user__name", "roadmap__employee_id")
            .annotate(steps_done=Count("id"))
            .order_by("-steps_done")[:5]
        )
        for ld in learner_data:
            top_learners.append({
                "name": ld["roadmap__employee__user__name"] or "Unknown",
                "steps_done": ld["steps_done"],
            })

        # Skills completed this month
        skills_completed_month = RoadmapStep.objects.filter(
            is_completed=True, completed_at__gte=thirty_days_ago
        ).count()

        # Recent activity (last 7 roadmaps created)
        recent_roadmaps = list(
            SkillRoadmap.objects
            .select_related("employee__user")
            .order_by("-created_at")[:7]
            .values("skill_name", "status", "employee__user__name", "created_at")
        )

        # Team insights (manager)
        team_insights = []
        if emp.role in ("manager", "hr", "admin"):
            reports = Employee.objects.filter(manager=emp, is_active=True).select_related("user")
            for r in reports:
                r_roadmaps = list(SkillRoadmap.objects.filter(employee=r).prefetch_related("steps"))
                total_steps = 0
                done_steps = 0
                skills = []
                for rm in r_roadmaps:
                    steps = list(rm.steps.all())
                    total_steps += len(steps)
                    done_steps += sum(1 for s in steps if s.is_completed)
                    if rm.status in active_statuses:
                        skills.append({"skill": rm.skill_name, "status": rm.status})
                team_insights.append({
                    "id": r.id,
                    "name": r.user.name if r.user else "",
                    "active_skills": skills,
                    "steps_completed": done_steps,
                    "steps_total": total_steps,
                    "completion_pct": round(done_steps / total_steps * 100) if total_steps else 0,
                })
            team_insights.sort(key=lambda x: -x["completion_pct"])

        return Response({
            "trending_skills": trending,
            "dept_breakdown": dept_data[:8],
            "status_distribution": status_dist,
            "total_roadmaps": total,
            "completed_roadmaps": completed,
            "in_progress_roadmaps": in_progress,
            "completion_rate": round(completed / total * 100) if total else 0,
            "active_learners": active_learners,
            "new_this_month": new_this_month,
            "new_this_week": new_this_week,
            "skills_completed_month": skills_completed_month,
            "top_learners": top_learners,
            "recent_activity": [
                {
                    "skill": r["skill_name"],
                    "status": r["status"],
                    "employee": r["employee__user__name"] or "Unknown",
                    "created_at": r["created_at"].isoformat() if r["created_at"] else "",
                }
                for r in recent_roadmaps
            ],
            "team_insights": team_insights,
        })


class DeptPeersRoadmapsView(APIView):
    """
    GET /upskilling/dept-peers/
    Returns approved/active roadmaps of dept peers (excluding own).
    Used by employees to discover what colleagues are learning.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        qs = (
            SkillRoadmap.objects
            .filter(
                employee__department=emp.department,
                status__in=["IN_PROGRESS", "COMPLETED", "PENDING_REVIEW"],
            )
            .exclude(employee=emp)
            .select_related("employee__user", "employee__department")
            .prefetch_related("steps")
            .order_by("-updated_at")[:30]
        )
        return Response(SkillRoadmapListSerializer(qs, many=True).data)


class CopyRoadmapView(APIView):
    """
    POST /upskilling/roadmaps/<pk>/copy/
    Employee copies a peer's roadmap steps into their own new roadmap → PENDING_APPROVAL.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def post(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Employee profile not found"}, status=404)

        try:
            source = SkillRoadmap.objects.prefetch_related("steps").get(pk=pk)
        except SkillRoadmap.DoesNotExist:
            return Response({"error": "Roadmap not found"}, status=404)

        if source.employee_id == emp.id:
            return Response({"error": "Cannot copy your own roadmap"}, status=400)

        # Check not already have same skill in progress
        existing = SkillRoadmap.objects.filter(
            employee=emp,
            skill_name=source.skill_name,
            status__in=["IN_PROGRESS", "PENDING_APPROVAL", "PENDING_REVIEW"],
        ).exists()
        if existing:
            return Response({"error": f"You already have an active roadmap for {source.skill_name}"}, status=400)

        # Create copy
        new_roadmap = SkillRoadmap.objects.create(
            employee=emp,
            skill_name=source.skill_name,
            description=f"Copied from {source.employee.user.name if source.employee.user else 'colleague'}. {source.description}",
            status="PENDING_APPROVAL",
        )
        for step in source.steps.order_by("order"):
            RoadmapStep.objects.create(
                roadmap=new_roadmap,
                title=step.title,
                description=step.description,
                order=step.order,
                resource_url=step.resource_url,
                resource_type=step.resource_type,
                phase=step.phase,
                difficulty=step.difficulty,
                duration=step.duration,
                status="PENDING",
            )

        # Notify manager
        try:
            from apps.notifications.services import InAppNotificationService
            if emp.manager and emp.manager.user:
                InAppNotificationService().create_notification(
                    recipient_email=emp.manager.user.email,
                    subject=f"Roadmap Approval: {emp.user.name} copied '{source.skill_name}'",
                    body=f"{emp.user.name} copied a peer roadmap for '{source.skill_name}' and needs your approval.",
                    metadata={"roadmap_id": new_roadmap.id, "employee_id": emp.id, "action_required": True},
                )
        except Exception:
            pass

        new_roadmap.refresh_from_db()
        return Response(SkillRoadmapSerializer(new_roadmap).data, status=201)
